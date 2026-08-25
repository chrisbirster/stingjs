plugins {
    id("com.android.application")
}

android {
    namespace = "run.stingjs.helloworld"
    compileSdk = 36

    defaultConfig {
        applicationId = "run.stingjs.helloworld"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":sting-runtime"))
    implementation(project(":sting-haptics"))
}
