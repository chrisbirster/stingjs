plugins {
    id("com.android.library")
}

android {
    namespace = "run.stingjs.runtime.candidates.quickjs"
    compileSdk = 36
    ndkVersion = "28.2.13676358"

    defaultConfig {
        minSdk = 23
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDir(layout.buildDirectory.dir("generated/jniLibs"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

val generatedJniLibs = layout.buildDirectory.dir("generated/jniLibs")

val buildOfficialQuickJsAndroid by tasks.registering(Exec::class) {
    group = "build"
    description = "Build the isolated official QuickJS Android candidate through Zig"
    outputs.dir(generatedJniLibs)
    commandLine(
        "bash",
        project.file("build-android.sh").absolutePath,
        generatedJniLibs.get().asFile.absolutePath,
    )
}

tasks.named("preBuild") {
    dependsOn(buildOfficialQuickJsAndroid)
}

dependencies {
    implementation(project(":sting-runtime"))
}
