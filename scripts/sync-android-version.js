const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const gradleFile = path.join(root, 'android', 'app', 'build.gradle')

const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(pkg.version || '1.0.0'))
const [, major, minor, patch] = m || ['', '1', '0', '0']
const versionName = `${major}.${minor}.${patch}`
const versionCode = Number(major) * 10000 + Number(minor) * 100 + Number(patch)

let content = fs.readFileSync(gradleFile, 'utf8')
content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
content = content.replace(/versionName\s+"[\w.+-]+"/, `versionName "${versionName}"`)
fs.writeFileSync(gradleFile, content)

console.log(`已同步 Android 版本: versionName ${versionName}, versionCode ${versionCode}`)