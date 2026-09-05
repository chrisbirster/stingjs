plugins {
    id("com.android.application")
}

android {
    namespace = "run.stingjs.go"
    compileSdk = 36

    defaultConfig {
        applicationId = "run.stingjs.go"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":sting-runtime"))
    implementation(project(":sting-haptics"))
    implementation(project(":sting-clipboard"))
    implementation(project(":sting-runtime-quickjs-candidate"))

    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
