// electron-builder afterPack hook: stamps the app icon and version info onto the Windows exe.
// Needed because signAndEditExecutable is off (see electron-builder.yml).
const path = require('node:path')
const rceditModule = require('rcedit')
const rcedit = rceditModule.rcedit ?? rceditModule

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const { productFilename, version } = context.packager.appInfo
  const exe = path.join(context.appOutDir, `${productFilename}.exe`)
  // Antivirus often scans the freshly written exe and locks it briefly ("Unable to commit
  // changes"), so retry a few times.
  for (let attempt = 1; ; attempt++) {
    try {
      await stamp(exe, version)
      break
    } catch (err) {
      if (attempt >= 6) throw err
      console.log(`  • exe busy (${err.message.trim().split('\n').pop()}), retrying in ${attempt}s…`)
      await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }
  console.log(`  • stamped icon and version ${version} on ${path.basename(exe)}`)
}

async function stamp(exe, version) {
  const productFilename = path.basename(exe, '.exe')
  await rcedit(exe, {
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    'file-version': version,
    'product-version': version,
    'version-string': {
      ProductName: 'ShadowTune',
      FileDescription: 'ShadowTune',
      CompanyName: 'ShadowTune (unofficial)',
      OriginalFilename: `${productFilename}.exe`
    }
  })
}
