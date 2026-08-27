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
include(
    ":app",
    ":sting-runtime",
    ":sting-haptics",
    ":sting-clipboard",
    ":sting-runtime-quickjs-candidate",
    ":sting-runtime-quickjs-ng-candidate",
)

project(":sting-runtime").projectDir = file("../../../native/android")
project(":sting-haptics").projectDir = file("../../../packages/modules/haptics/android")
project(":sting-clipboard").projectDir = file("../../../packages/modules/clipboard/android")
project(":sting-runtime-quickjs-candidate").projectDir = file("../../../runtime/prototypes/quickjs/android")
project(":sting-runtime-quickjs-ng-candidate").projectDir = file("../../../runtime/prototypes/quickjs-ng/android")
