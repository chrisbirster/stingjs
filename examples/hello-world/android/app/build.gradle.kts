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
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    sourceSets {
        getByName("main") {
            assets.srcDir("../../dist")
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
    implementation(project(":sting-runtime-quickjs-candidate"))

    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
