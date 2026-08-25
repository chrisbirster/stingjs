pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "StingHelloWorldAndroid"
include(":app", ":sting-runtime", ":sting-haptics")

project(":sting-runtime").projectDir = file("../../../native/android")
project(":sting-haptics").projectDir = file("../../../packages/modules/haptics/android")
