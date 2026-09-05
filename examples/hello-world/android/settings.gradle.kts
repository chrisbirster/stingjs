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
    ":sting-device",
    ":sting-filesystem",
    ":sting-secure-store",
    ":sting-network",
    ":sting-sharing",
    ":sting-sensors",
    ":sting-image-picker",
    ":sting-location",
    ":sting-contacts",
    ":sting-camera",
    ":sting-notifications",
    ":sting-audio",
    ":sting-background-task",
    ":sting-runtime-quickjs-candidate",
)

project(":sting-runtime").projectDir = file("../../../native/android")
project(":sting-haptics").projectDir = file("../../../packages/modules/haptics/android")
project(":sting-clipboard").projectDir = file("../../../packages/modules/clipboard/android")
project(":sting-device").projectDir = file("../../../packages/modules/device/android")
project(":sting-filesystem").projectDir = file("../../../packages/modules/filesystem/android")
project(":sting-secure-store").projectDir = file("../../../packages/modules/secure-store/android")
project(":sting-network").projectDir = file("../../../packages/modules/network/android")
project(":sting-sharing").projectDir = file("../../../packages/modules/sharing/android")
project(":sting-sensors").projectDir = file("../../../packages/modules/sensors/android")
project(":sting-image-picker").projectDir = file("../../../packages/modules/image-picker/android")
project(":sting-location").projectDir = file("../../../packages/modules/location/android")
project(":sting-contacts").projectDir = file("../../../packages/modules/contacts/android")
project(":sting-camera").projectDir = file("../../../packages/modules/camera/android")
project(":sting-notifications").projectDir = file("../../../packages/modules/notifications/android")
project(":sting-audio").projectDir = file("../../../packages/modules/audio/android")
project(":sting-background-task").projectDir = file("../../../packages/modules/background-task/android")
project(":sting-runtime-quickjs-candidate").projectDir = file("../../../runtime/prototypes/quickjs/android")
