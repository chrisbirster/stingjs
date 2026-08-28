plugins {
    id("com.android.application")
}

android {
    namespace = "run.stingjs.externalhost"
    compileSdk = 36

    defaultConfig {
        applicationId = "run.stingjs.externalhost"
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
    implementation(files("libs/sting-runtime.aar"))
    implementation(files("libs/sting-quickjs.aar"))
}
