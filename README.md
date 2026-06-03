# digiKam web viewer

A light and efficient digiKam web viewer for home hosting, with a backend based on node.js and a SPA frontend based on jQuery.

The web viewer allows to visualize photos with albums, tags and date criterias.

To populate photos gallery, thumbnails are extracted from digiKam database and converted on the fly in memory to JPEG format.
An addon to node.js is provided to allow this conversion.

A click on a thumbnail show the original photo.

Oroginal photos can be downloaded to browser in a zip file.


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

If using MySQL internal mode, digiKam must be running prior to start the server. Alternatively it is possible to run mariadbd using the same connection parameters than digiKam as seen in 'ps -ef | grep digikam'

``` bash
$ node digikamweb.mjs -v
``` 

Run the server.

``` bash
$ node digikamweb.mjs -v
```

With a browser open [http://localhost:4000/](http://localhost:4000/).

# GUI operation

The base configuration allows to connect without password from a local server. Just click on the lock on right top, and you should see a list of your albums and tags.

- Clicking on one or more albums show thumbnails from these albums.
- Clicking on one or more tags show thumbnails for these tags.
- Clicking tags with albums, show thumbnails for theses tags in selected albums

Wou can narrow search with date start and date end. If no start date, it means dawn of time to end date. If no end date, it means up to now.

The following dates formats are legal

- 2026-06-06 or 20260606,  2016-06 or 202601, 2026. Time is accepted but not used (yy-dmm-dd hh:mm:ss).
- for a start date, 2026 -> 2026-01-01 and 2026-06 -> 2026-06-01
- for an end date, 2026 -> 2026-12-31, 2026-06 -> 2026-06-31 (yes 06-31 is legal in SQL!)

The limit field allows to speedup searches limiting the number of thumbnails retrieved from server. Il could be 20 when doing your selections (each click start a search) and then 2000 when you yant view the gallery.

The gallery desig was inspired from Libre-photo.

On the gallery, a click on a photo show the original one. A click on this photo (or ESC) dismiss it.
A small square on top left of the photo allow to select if for download. you can select many of them with this square or using Ctrl-click on a picture or Shift-click on a picture for a range.

Usefull on a cell interface, 2 buttons in the middle of the top menu allow the same functionnality. The first one activates Ctrl-click, the second one, Shift-click and the third one initiate a transfer of selected picture to your browser in a zip file.

Actually translations have been made just for French, but it is easy to update the translations.toml to add a new language. Please send me new translations of you add some.

# Configuration

Apart database access, there are few things to configure. 

You can change server HTTP port.

You can add/remove users and change their default laguange or password. Security is quite basic. For actual version, passwords are in clear in configuration file. It could be certainely improved if requested. 

It is possible to set local_trusted for local access.

Users can be restricted on albums and tags if you want share limited photos.


It is possible to use SSL by setting force_ssl to true. The provided key is self generated, so the browser will issue a warning at first use.

# License

[GPLv3](./COPYING)
