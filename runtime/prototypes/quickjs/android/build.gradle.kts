plugins {
    id("com.android.library")
}

val generatedJniLibsDir = layout.buildDirectory.dir("generated/jniLibs").get().asFile

android {
    namespace = "run.stingjs.runtime.candidates.quickjs"
    compileSdk = 36
    ndkVersion = "28.2.13676358"

    defaultConfig {
        minSdk = 23
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDir(generatedJniLibsDir)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

val buildOfficialQuickJsAndroid by tasks.registering(Exec::class) {
    group = "build"
    description = "Build the isolated official QuickJS Android candidate through Zig"
    outputs.dir(generatedJniLibsDir)
    commandLine(
        "bash",
        project.file("build-android.sh").absolutePath,
        generatedJniLibsDir.absolutePath,
    )
}

tasks.named("preBuild") {
    dependsOn(buildOfficialQuickJsAndroid)
}

dependencies {
    implementation(project(":sting-runtime"))
}
