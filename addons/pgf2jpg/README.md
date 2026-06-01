# pgf2jpg

PGF to JPG image converter

- Used to display digiKam thumbnails in a browser
- Very fast in-memory conversion.

## Sources
[@cgilles/digikam-pgf-database](https://github.com/cgilles/digikam-pgf-database) for a working libpgf library and examples to use it.

The original library [libPGF](https://libpgf.org/) was written for Windows. 

[@stbrumme/toojpeg](https://github.com/stbrumme/toojpeg) for light JPEG generation.

## Build node addon

``` bash
$ cd ${digikamweb_sourcedir}/addons/pgf2jpg
$ npx cmake-js compile
```

The backend will search the addon under ```${digikamweb_sourcedir}/addons/pgf2jpg/build/Release ```

## Build cli module

May be useful to extract manually PGF files.

``` bash
$ cd ${digikamweb_sourcedir}/addons/pgf2jpg
$ mkdir -p build-cli							# first time
$ cd build-cli
$ cmake -DCLI=ON -DCMAKE_BUILD_TYPE=Debug ..		# first time
$ make

```

# License

[GPLv3](./COPYING)
