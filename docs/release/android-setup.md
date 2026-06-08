# Android scaffold — setup & release (issue #31)

> 状态：M3 W1 — PR #57（待合）落地 `app/android/` 全部源码配置。
> **缺**：`gradlew` / `gradlew.bat` / `gradle/wrapper/gradle-wrapper.jar` — 三个 binary bit
> **必须** `flutter create` 现场生成，不要试图手写。

---

## 1. 一次性的本地初始化

**谁做**：开发者第一次 checkout repo 后（每个机器一次）。

```bash
cd app
flutter create -t app --platforms=android .
# 这一步会：
#   - 创建 / 覆盖 android/ 目录
#   - 但只覆盖 gradlew / gradlew.bat / gradle/wrapper/gradle-wrapper.jar 等 binary bits
#   - 不会修改我们已经提交的所有 *.gradle / AndroidManifest.xml（除非显式用 --overwrite）
# 关键是：不要用 --overwrite！否则会覆盖我们写的 build.gradle / AndroidManifest。
```

执行完后 `git status` 应该显示：

```
Untracked:
  android/.gradle/
  android/.idea/
  android/gradlew
  android/gradlew.bat
  android/gradle/wrapper/gradle-wrapper.jar
  android/local.properties
```

`local.properties` 在 `app/android/.gitignore` 里，不会被 commit。

**Windows 注意事项**：`flutter create` 不会自动把 CRLF 写进 `.gradle/` 之类，但 PowerShell 可能会。**先 `git config core.autocrlf false` 再 `flutter create`**（参见根 AGENTS.md "line endings" 一节）。

---

## 2. Android SDK 路径

CI 注入；本地开发有两种方式：

### 方式 A：local.properties（推荐）

`app/android/local.properties`（已 gitignore）：

```properties
sdk.dir=C:\\Users\\Steven.du\\AppData\\Local\\Android\\Sdk
flutter.sdk=C:\\Users\\Steven.du\\development\\flutter
flutter.versionName=0.1.0
flutter.versionCode=1
```

### 方式 B：环境变量

```
ANDROID_SDK_ROOT=C:\Users\Steven.du\AppData\Local\Android\Sdk
```

---

## 3. Mapbox tokens (TWO of them)

StudyBuddy needs **two distinct** Mapbox tokens:

| Token | Where | Source | Lifetime |
| --- | --- | --- | --- |
| **Public** `pk.…` | Dart code via `--dart-define ACCESS_TOKEN=…` | <https://account.mapbox.com/access-tokens/> | commit to repo? **NO** — passed at build time |
| **Secret** `sk.…` | Gradle host (`~/.gradle/gradle.properties` `MAPBOX_DOWNLOADS_TOKEN`) | same dashboard, **with `Downloads: Read` scope** | commit to repo? **NO** — host file |

The public token is what the running app sends to the Mapbox API at
runtime to render tiles. The secret token is what the Gradle build
uses once, to download the native SDK from `maven.mapbox.com`.

### 3.1 Public token — Flutter runtime

See [ios-metadata.md §9](./ios-metadata.md#9-mapbox-access-token-flutter--android) for the full runbook. TL;DR:

```bash
cd app
flutter build apk --release --dart-define ACCESS_TOKEN=pk.eyJ…
```

CI injects from the `MAPBOX_PUBLIC_TOKEN` GitHub secret.

### 3.2 Secret token — Gradle downloads

`mapbox_gl` plugin 在 gradle 编译时需要从
`https://api.mapbox.com/downloads/v2/releases/maven` 拉 native SDK。
这需要 **secret** token（`sk.*`），不是 public `pk.*`。

**CI**：在 GitHub repo settings → Secrets → `MAPBOX_DOWNLOADS_TOKEN`
加一个 secret，workflow 用它写 `~/.gradle/gradle.properties`：

```yaml
- name: Inject Mapbox secret token
  run: |
    mkdir -p ~/.gradle
    echo "MAPBOX_DOWNLOADS_TOKEN=${{ secrets.MAPBOX_DOWNLOADS_TOKEN }}" >> ~/.gradle/gradle.properties
```

**本地开发**：`~/.gradle/gradle.properties`（**全局 gradle home**，
不在 repo 里）：

```properties
MAPBOX_DOWNLOADS_TOKEN=sk.eyJ...YOUR_SECRET...
```

### 3.3 Rotation policy

- Public token: **every 90 days**. Revoke + create new in
  Mapbox dashboard, update `MAPBOX_PUBLIC_TOKEN` GitHub secret,
  ship a build. Old clients keep working until their next refresh.
- Secret token: **every 6 months**, or **immediately** if anyone
  with gradle access might have leaked it. Revoking invalidates
  future SDK downloads, so coordinate with ops to avoid a build
  outage window.

---

## 4. 跑通

```bash
cd app
flutter pub get
flutter build apk --debug
# 第一次会从 maven.mapbox.com 拉 ~50 MB 的 Mapbox SDK，需要 5-15 分钟
```

成功后产物在 `app/build/app/outputs/flutter-apk/app-debug.apk`。

---

## 5. Release / 签名（Play Store 上架前）

需要 Android keystore（一次性）：

```bash
keytool -genkey -v -keystore android/app/studybuddy-release.keystore \
  -alias studybuddy -keyalg RSA -keysize 2048 -validity 10000
```

然后在 `app/android/key.properties`（gitignore）：

```properties
storePassword=<store-pw>
keyPassword=<key-pw>
keyAlias=studybuddy
storeFile=app/studybuddy-release.keystore
```

`android/app/build.gradle` 里现在用的是 debug signingConfig placeholder。release 上架前把 `signingConfigs.release` 改为读 `key.properties`：

```groovy
signingConfigs {
    release {
        keyAlias = keyProperties['keyAlias']
        keyPassword = keyProperties['keyPassword']
        storeFile = file(keyProperties['storeFile'])
        storePassword = keyProperties['storePassword']
    }
}
```

---

## 6. M3 W2 followups

- 真实品牌 launcher icon（设计团队出图后替换 `mipmap-anydpi-v26/ic_launcher.xml` + `drawable/ic_launcher_foreground.xml`）
- `compileSdkVersion` 跟随 Flutter 升级
- R8 / ProGuard 规则补全（mapbox_gl 已经自动 keep，看下没有反射调用漏的）
- minSdkVersion 21 是 mapbox_gl 的硬要求；想升 23+ 等 plugin 升级
