
#include <stdio.h>

#include "pgf2jpg.h"
#include "PGFimage.h"
#include "toojpeg.h"


static size_t jpgbufsize;
static size_t jpgtmpsize;
static unsigned char *jpgbuf;

static void appendbyte (unsigned char byte) {
	if (jpgtmpsize < jpgbufsize)
		jpgbuf[jpgtmpsize++] = byte;
}


static unsigned char* readPGFImageData(unsigned char *pgfbuf, size_t pgfsize, size_t *rgbsize, int *rgbwidth, int *rgbheight) {
	CPGFImage pgfImg;

	pgfImg.ConfigureDecoder(false);

	CPGFMemoryStream stream(reinterpret_cast<UINT8*>(const_cast<unsigned char*>(pgfbuf)), pgfsize);

	try {
		pgfImg.Open(&stream);
	}
	catch (IOException &ioe) {
		printf("invalid file format\n");
		return NULL;
	}

	int BigEndian = 0;
	int depth = 24;
	*rgbwidth = pgfImg.Width();
	*rgbheight = pgfImg.Height();
	int bytes_per_line = (*rgbwidth) * (depth/8);

	try {
		pgfImg.Read();
	}
	catch (IOException &ioe) {
		printf("unable to decode image\n");
		return NULL;
	}

	if (PGF2JPG_DEBUG)
		printf ("... pgfImg.channels()=%d\n", pgfImg.Channels());		// An image of type RGB contains 3 image channels (B, G, R)

	*rgbsize = bytes_per_line*(*rgbheight);
	unsigned char *rgbbuf = new unsigned char[*rgbsize];
	if (PGF2JPG_DEBUG)
		printf ("... new[%6ld] -> rgbbuf(%p)\n", *rgbsize, rgbbuf);

	if (BigEndian) {
		if (PGF2JPG_DEBUG)
			printf ("... BigEndian\n");
		int map[] = { 3, 2, 1, 0 };			// BGR[A]
		pgfImg.GetBitmap(bytes_per_line, rgbbuf, depth, map);
	} else {
		if (PGF2JPG_DEBUG)
			printf ("... LittleEndian\n");
		//	int map[] = { 0, 1, 2, 3 };			// RGBR
			int map[] = { 2, 1, 0, 3 };			// for 3 channels, tweek to have it work. not sure why
		pgfImg.GetBitmap(bytes_per_line, rgbbuf, depth, map);
	}
	return rgbbuf;
}

unsigned char* pgf2jpg (unsigned char *pgfbuf, size_t pgfsize, int orientation,
						size_t *jpgsize, size_t *jpgwidth, size_t *jpgheight) {
	unsigned char *rgbbuf;
	size_t rgbsize;
	int rgbwidth, rgbheight;

	// convert PFG data to RGB. returns an RGB array (3 bytes per pixel)
	rgbbuf = readPGFImageData (pgfbuf, pgfsize, &rgbsize, &rgbwidth, &rgbheight);

	// rotate buffer if required. old buffer is deleted
	rgbbuf = rotateRGB (rgbbuf, rgbsize, orientation, &rgbwidth, &rgbheight);
	if (PGF2JPG_DEBUG)
		printf ("... rgbbuf = (%p)\n", rgbbuf);

	// convert RGB to JPG
	const bool isRGB = true;  // true = RGB image, else false = grayscale
	const auto quality = 90; // compression quality: 0 = worst, 100 = best, 80 to 90 are most often used
	const bool downsample = false; // false = save as YCbCr444 JPEG (better quality), true = YCbCr420 (smaller file)
	const char *comment = "digiKam thumbnail"; // arbitrary JPEG comment

	jpgbufsize = pgfsize*2;					// should be enough;
	jpgbuf = new unsigned char[jpgbufsize];
	if (PGF2JPG_DEBUG)
		printf ("... new[%6ld] -> jpgbuf(%p)\n", jpgbufsize, jpgbuf);
	jpgtmpsize = 0;

	TooJpeg::writeJpeg(appendbyte, rgbbuf, rgbwidth, rgbheight, isRGB, quality, downsample, comment);

	*jpgsize   = jpgtmpsize;
	*jpgwidth  = rgbwidth;
	*jpgheight = rgbheight;

	if (PGF2JPG_DEBUG)
		printf ("... delete[]    <- rgbbuf(%p)\n", rgbbuf);
	delete[] rgbbuf;

	return jpgbuf;
}


unsigned char* rotateRGB (unsigned char *rgbbuf, size_t rgbsize, int orientation,
						int *rgbwidth, int *rgbheight) {
	unsigned char *rotbuf = new unsigned char[rgbsize];
	if (PGF2JPG_DEBUG)
		printf ("... new[%6ld] -> rotbuf(%p)\n", rgbsize, rotbuf);
	int b3=3;		// bytes per pixel

	int ws=*rgbwidth, hs=*rgbheight;
	int wd=*rgbwidth, hd=*rgbheight;

	if (PGF2JPG_DEBUG)
		printf ("... rotateRGB: rgbsize=%ld, rgbwidth=%d, rgbheight=%d, rgbsize'=%d\n",
			rgbsize,*rgbwidth,*rgbheight,*rgbwidth**rgbheight*b3);


	if (orientation==ORIENTATION_ROT_90_HFLIP ||orientation==ORIENTATION_ROT_90 ||
		orientation==ORIENTATION_ROT_90_VFLIP ||orientation==ORIENTATION_ROT_270) {
		hd = *rgbwidth;
		wd = *rgbheight;
		*rgbwidth = wd;
		*rgbheight = hd;
	}

	uchar *ps=rgbbuf, *pd;

	for (int ys=0; ys<hs; ys++) {
		int xd=0, yd=0;
		for (int xs=0; xs<ws; xs++) {
			switch(orientation) {
			case ORIENTATION_UNSPECIFIED:
			case ORIENTATION_NORMAL:
			default:
				yd = ys;
				xd = xs;
				break;
			case ORIENTATION_HFLIP:
				yd = ys;
				xd = ws-xs-1;
				break;
			case ORIENTATION_ROT_180:
				yd = hs-ys-1;
				xd = ws-xs-1;
				break;
			case ORIENTATION_VFLIP:
				yd = hs-ys-1;
				xd = xs;
				break;

			case ORIENTATION_ROT_90_HFLIP:
				yd = xs;
				xd = ys;
				break;
			case ORIENTATION_ROT_90:
				yd = xs;
				xd = hs-ys-1;
				break;
			case ORIENTATION_ROT_90_VFLIP:
				yd = ws-xs-1;
				xd = hs-ys-1;
				break;
			case ORIENTATION_ROT_270:
				yd = ws-xs-1;
				xd = ys;
				break;
			}

			if (0) {
				printf ("s(%3d,%3d)->d(%3d,%3d)  ", ys,xs,yd,xd);
				if ((xs+1)%8==0)
					printf ("\n");
			}
			pd = rotbuf +(yd*wd+xd)*b3;
			memcpy (pd, ps+=b3, b3);
		}
	}


	if (PGF2JPG_DEBUG)
		printf ("... delete[]    <- rgbbuf(%p)\n", rgbbuf);
	delete[] rgbbuf;
	return rotbuf;
}
