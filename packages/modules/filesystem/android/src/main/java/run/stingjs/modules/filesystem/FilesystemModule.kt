package run.stingjs.modules.filesystem

import android.content.Context
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.util.concurrent.Executors
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult

class FilesystemModule(context: Context) : StingNativeModule {
    override val name = "Filesystem"
    override val version = "0.1.0"

    private val appContext = context.applicationContext
    private val executor = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "StingFilesystem").apply { isDaemon = true }
    }

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        throw StingNativeModuleError(
            code = "E_SYNC_UNSUPPORTED",
            message = "Filesystem methods are asynchronous",
        )
    }

    override fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        executor.execute {
            try {
                completion(StingNativeModuleResult.Success(perform(method, arguments)))
            } catch (error: StingNativeModuleError) {
                completion(StingNativeModuleResult.Failure(error))
            } catch (error: Throwable) {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_IO",
                            message = error.message ?: "Filesystem operation failed",
                            details = mapOf("method" to method),
                        ),
                    ),
                )
            }
        }
    }

    private fun perform(method: String, arguments: List<Any?>): Any? = when (method) {
        "readText" -> {
            val target = target(arguments, pathIndex = 0, directoryIndex = 1)
            requireExistingFile(target)
            try {
                target.readText(Charsets.UTF_8)
            } catch (error: Throwable) {
                throw ioError("Unable to read file", target, error)
            }
        }

        "writeText" -> {
            val contents = arguments.getOrNull(1) as? String
                ?: throw invalidArgument("Filesystem.writeText requires string contents")
            val target = target(arguments, pathIndex = 0, directoryIndex = 2)
            requireWritableTarget(target)
            try {
                target.writeText(contents, Charsets.UTF_8)
                null
            } catch (error: Throwable) {
                throw ioError("Unable to write file", target, error)
            }
        }

        "delete" -> {
            val target = target(arguments, pathIndex = 0, directoryIndex = 1)
            if (!target.exists()) throw notFound(target)
            try {
                if (!deleteWithoutFollowingSymlinks(target)) {
                    throw StingNativeModuleError(
                        code = "E_IO",
                        message = "Unable to delete path",
                        details = mapOf("path" to target.path),
                    )
                }
                null
            } catch (error: StingNativeModuleError) {
                throw error
            } catch (error: Throwable) {
                throw ioError("Unable to delete path", target, error)
            }
        }

        "makeDirectory" -> {
            val target = target(arguments, pathIndex = 0, directoryIndex = 1)
            if (target.exists()) {
                throw StingNativeModuleError(
                    code = "E_ALREADY_EXISTS",
                    message = "Filesystem path already exists",
                    details = mapOf("path" to target.path),
                )
            }
            try {
                if (!target.mkdirs()) {
                    throw StingNativeModuleError(
                        code = "E_IO",
                        message = "Unable to create directory",
                        details = mapOf("path" to target.path),
                    )
                }
                null
            } catch (error: StingNativeModuleError) {
                throw error
            } catch (error: Throwable) {
                throw ioError("Unable to create directory", target, error)
            }
        }

        "getInfo" -> {
            val target = target(arguments, pathIndex = 0, directoryIndex = 1)
            if (!target.exists()) {
                mapOf(
                    "exists" to false,
                    "type" to null,
                    "size" to 0,
                    "modifiedAt" to null,
                )
            } else {
                mapOf(
                    "exists" to true,
                    "type" to if (target.isDirectory) "directory" else "file",
                    "size" to if (target.isDirectory) 0 else target.length(),
                    "modifiedAt" to target.lastModified().takeIf { it > 0L },
                )
            }
        }

        else -> throw StingNativeModuleError(
            code = "E_METHOD_NOT_FOUND",
            message = "Filesystem does not implement asynchronous method $method",
        )
    }

    private fun target(
        arguments: List<Any?>,
        pathIndex: Int,
        directoryIndex: Int,
    ): File {
        val path = arguments.getOrNull(pathIndex) as? String
            ?: throw invalidArgument("Filesystem requires a relative path")
        val directory = arguments.getOrNull(directoryIndex) as? String
            ?: throw invalidArgument("Filesystem requires a base directory")
        return resolve(path, directory)
    }

    private fun resolve(path: String, directory: String): File {
        if (path.isEmpty() || path.startsWith('/') || path.contains('\\')) {
            throw invalidPath(path)
        }
        val components = path.split('/')
        if (components.any { it.isEmpty() || it == "." || it == ".." }) {
            throw invalidPath(path)
        }

        val root = when (directory) {
            "documents" -> appContext.filesDir
            "cache" -> appContext.cacheDir
            else -> throw invalidArgument("Filesystem base directory must be documents or cache")
        }.canonicalFile

        val resolved = File(root, path).canonicalFile
        val rootPrefix = root.path.trimEnd(File.separatorChar) + File.separator
        if (!resolved.path.startsWith(rootPrefix)) {
            throw invalidPath(path)
        }
        return resolved
    }

    private fun requireExistingFile(target: File) {
        if (!target.exists()) throw notFound(target)
        if (target.isDirectory) {
            throw StingNativeModuleError(
                code = "E_IS_DIRECTORY",
                message = "Filesystem path is a directory",
                details = mapOf("path" to target.path),
            )
        }
    }

    private fun requireWritableTarget(target: File) {
        if (target.exists() && target.isDirectory) {
            throw StingNativeModuleError(
                code = "E_IS_DIRECTORY",
                message = "Filesystem path is a directory",
                details = mapOf("path" to target.path),
            )
        }
        val parent = target.parentFile
        if (parent == null || !parent.exists() || !parent.isDirectory) {
            throw StingNativeModuleError(
                code = "E_NOT_FOUND",
                message = "Filesystem parent directory does not exist",
                details = mapOf("path" to (parent?.path ?: target.path)),
            )
        }
    }

    private fun deleteWithoutFollowingSymlinks(target: File): Boolean {
        val mode = Os.lstat(target.path).st_mode
        if (OsConstants.S_ISLNK(mode) || !target.isDirectory) {
            return target.delete()
        }

        val children = target.listFiles() ?: return false
        for (child in children) {
            if (!deleteWithoutFollowingSymlinks(child)) return false
        }
        return target.delete()
    }

    private fun invalidArgument(message: String) = StingNativeModuleError(
        code = "E_INVALID_ARGUMENT",
        message = message,
    )

    private fun invalidPath(path: String) = StingNativeModuleError(
        code = "E_INVALID_PATH",
        message = "Filesystem paths must stay inside the selected app-private root",
        details = mapOf("path" to path),
    )

    private fun notFound(target: File) = StingNativeModuleError(
        code = "E_NOT_FOUND",
        message = "Filesystem path does not exist",
        details = mapOf("path" to target.path),
    )

    private fun ioError(message: String, target: File, underlying: Throwable) = StingNativeModuleError(
        code = "E_IO",
        message = "$message: ${underlying.message ?: underlying::class.java.simpleName}",
        details = mapOf("path" to target.path),
    )
}
