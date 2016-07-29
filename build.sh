#!/bin/bash -e

MYDIR=`dirname $0`
TOPDIR=`cd $MYDIR; pwd`
DISTDIR="$TOPDIR/dist"
RELEASEDIR="$TOPDIR/release"
APP="opennms-chat"
APP_PATH="$DISTDIR/opennms-chat-darwin-x64/opennms-chat.app"
RESULT_PATH="$HOME/Desktop/opennms-chat.pkg"

INSTALLER_KEY="Developer ID Installer: The OpenNMS Group, Inc. (N7VNY4MNDW)"

echo "* making sure dependencies are up-to-date"
npm install

echo "* cleaning $DISTDIR"
sudo rm -rf "$DISTDIR"/* "$RELEASEDIR"/*

echo "* building"
npm run package:all

echo "* creating dist archive(s)"
pushd release
	for dir in *-darwin* *-win32*; do
		zip -9 -r "$dir.zip" "$dir"
	done
	for dir in *-linux*; do
		tar -cvzf "$dir.tar.gz" "$dir"
	done

	printf "Really rsync? [y/N] "
	read DO_RSYNC

	case $DO_RSYNC in
		Y|y)
			rsync -avzr --progress *.zip *.tar.gz ranger@www.opennms.org:/var/www/sites/opennms.org/site/www/mattermost/
			;;
		*)
			echo "Fine then. Skipping."
			;;
	esac
popd dist

