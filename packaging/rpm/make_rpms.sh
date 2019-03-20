#! /bin/sh

echo DEBUG `pwd`
[ ! -f "VERSION" -o ! -f .gitignore -o ! -d .git ] && \
echo "run this script at the top directory of your git repo" && exit 1
. ./VERSION

SPEC="packaging/rpm/pcp-grafana-datasource.spec"
tmpdir=$(mktemp -d $PWD/rpm-build.XXXXXX)
TAR="$tmpdir/pcp-grafana-datasource-$VER.src.tar.gz"

git archive --format=tar --prefix=pcp-grafana-datasource-$VER/ master | gzip -9 >$TAR
[ ! -f "$TAR" ] && echo 'Failed to create "$TAR"' && exit 1

rpmbuild -ba \
    --define "_sourcedir $tmpdir" \
    --define "_specdir $tmpdir" \
    --define "_builddir $tmpdir" \
    --define "_srcrpmdir $tmpdir" \
    --define "_rpmdir $tmpdir/output" \
    --define "_buildrootdir $tmpdir/build" \
    $SPEC || exit 1

mv $TAR $tmpdir/*.rpm $tmpdir/output/*/*.rpm packaging/rpm
rm -rf $tmpdir

echo;echo "=== created packages ===";ls -1 packaging/rpm/*.{rpm,tar.gz}
exit 0
