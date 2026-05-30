from setuptools import setup

APP = ['mac_clip.py']
OPTIONS = {
    'argv_emulation': False,
    'packages': ['rumps', 'requests', 'certifi', 'urllib3', 'idna', 'charset_normalizer'],
    'plist': {
        'LSUIElement': True,
        'CFBundleName': 'Clip Listener',
        'CFBundleDisplayName': 'Clip Listener',
        'CFBundleIdentifier': 'com.mustafa.clip-listener',
        'CFBundleVersion': '1.0.0',
        'CFBundleShortVersionString': '1.0',
        'NSUserNotificationAlertStyle': 'alert',
    },
}

setup(
    name='Clip Listener',
    app=APP,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
