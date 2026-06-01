# digiKam web viewer

A light and efficient digiKam web viewer with a backend based on node.js and a SPA frontend based on jQuery.

The web viewer allows to visualize photos with albums, tags and date criterias.

To populate photos gallery, thumbnails are extracted from digiKam database and converted on the fly in memory to JPEG format.
An addon to node.js is provided to allow this conversion.

A click on a thumbnail show the original photo.

Oroginal photos can be downloaded to browser in thru a zip file.


In summary:
- Very fast. It takes ~15 seconds to load 1000 thumbnails
- No docker container requires
- No thumnails conversion prior tu use

# Install

First you must build the addon [pgf2jpg](./addons/pgf2jpg/README.md)

Then install node dependencies with `pnpm`:

``` bash
$ cd ${digikamweb_sourcedir}/backend
$ pnpm install
```

# Quick start

Copy digikamweb-template.toml to digikamweb.toml and edit to configure database.

Run the server

``` bash
$ node digikamweb -s
```

With a browser open [http://localhost:4000/](http://localhost:4000/)

# License

[GPLv3](./COPYING)
