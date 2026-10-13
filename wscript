# Standard-Buildskript des Pebble-SDK (Vorlage von `pebble new-project`), dazu -flto seit 0.8.2.
import os.path

top = '.'
out = 'build'


def options(ctx):
    ctx.load('pebble_sdk')


def configure(ctx):
    ctx.load('pebble_sdk')


def build(ctx):
    ctx.load('pebble_sdk')
    binaries = []
    cached_env = ctx.env
    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        # Linkzeit-Optimierung (0.8.2): 2,7 KB kleiner, das App-Abbild darf höchstens 64 KB groß sein.
        # --undefined hält den App-Kopf fest: ohne wirft LTO __pbl_app_info weg (nichts referenziert ihn),
        # der Bau läuft durch, die Uhr lehnt die Installation ab ("App install failed")
        ctx.env.append_value('CFLAGS', '-flto')
        ctx.env.append_value('LINKFLAGS', ['-flto', '-Wl,--undefined=__pbl_app_info'])
        ctx.pbl_build(source=ctx.path.ant_glob('src/c/**/*.c'), target=app_elf, bin_type='app')
        binaries.append({'platform': platform, 'app_elf': app_elf})
    ctx.env = cached_env
    ctx.set_group('bundle')
    ctx.pbl_bundle(binaries=binaries,
                   js=ctx.path.ant_glob(['src/pkjs/**/*.js', 'src/pkjs/**/*.json']),
                   js_entry_file='src/pkjs/index.js')
