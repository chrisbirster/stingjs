plugins {
    id("com.android.library")
}

android {
    namespace = "run.stingjs.modules.sensors"
    compileSdk = 36

    defaultConfig {
        minSdk = 23
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":sting-runtime"))
}
