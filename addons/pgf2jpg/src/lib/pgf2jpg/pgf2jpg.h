
#pragma once

#include <stddef.h>


// digikam/core/metadataengine/engine/metaengine.h
 enum ImageOrientation
{
	ORIENTATION_UNSPECIFIED  = 0,
	ORIENTATION_NORMAL       = 1,
	ORIENTATION_HFLIP        = 2,
	ORIENTATION_ROT_180      = 3,
	ORIENTATION_VFLIP        = 4,
	ORIENTATION_ROT_90_HFLIP = 5,
	ORIENTATION_ROT_90       = 6,
	ORIENTATION_ROT_90_VFLIP = 7,
	ORIENTATION_ROT_270      = 8
};

typedef unsigned char uchar;

#define PGF2JPG_DEBUG 0

unsigned char* pgf2jpg (unsigned char *pgfbuf, size_t pgfsize, int orientation, \
						size_t *jpgsize, size_t *jpgwidth, size_t *jpgheight);

unsigned char* rotateRGB (unsigned char *rgbbuf, size_t rgbsize, int orientation, \
						  int *rgbwidth, int *rgbheight);
