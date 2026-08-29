plugins {
    id("com.android.application")
}

android {
    namespace = "__ANDROID_PACKAGE__"
    compileSdk = 36

    defaultConfig {
        applicationId = "__ANDROID_PACKAGE__"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets.getByName("main").java.srcDir(
        rootProject.file("../.sting/generated/android/src/main/java")
    )
}

dependencies {
    implementation(files("libs/sting-runtime.aar"))
    implementation(files("libs/sting-quickjs.aar"))
}

val syncStingBundle by tasks.registering(Copy::class) {
    from(rootProject.file("../dist/sting-app.js"))
    into(layout.projectDirectory.dir("src/main/assets"))
}

tasks.named("preBuild").configure {
    dependsOn(syncStingBundle)
}
