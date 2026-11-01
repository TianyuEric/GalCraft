#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${GALCRAFT_DEVELOPMENT_TEAM:?Set GALCRAFT_DEVELOPMENT_TEAM to your Apple team ID}"
exec xcodebuild -project GalCraftPlayer.xcodeproj -scheme GalCraftPlayer -configuration Release -destination 'generic/platform=iOS' -archivePath "$PWD/../artifacts/GalCraftPlayer.xcarchive" "DEVELOPMENT_TEAM=$GALCRAFT_DEVELOPMENT_TEAM" CODE_SIGN_STYLE=Automatic archive
