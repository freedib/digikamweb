
#include <stdio.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>

#include "pgf2jpg.h"


unsigned char* readFile (const char *name, size_t *pgfsize) {
	int fdi = open(name, O_RDONLY);
	struct stat stat_fdi;
	if (fstat(fdi, &stat_fdi) != 0)
		return NULL;
	*pgfsize = stat_fdi.st_size;
	unsigned char *pgfbuf = new unsigned char[*pgfsize];
	if (PGF2JPG_DEBUG)
		printf ("... new[%6ld] -> pgfbuf(%p)\n", *pgfsize, pgfbuf);
	read(fdi, pgfbuf, *pgfsize);
	close(fdi);
	return pgfbuf;
}

void writeFile (const char *name, unsigned char *buf, long size) {
	int fdo = open(name, O_WRONLY | O_CREAT, 0644);
	write(fdo, buf, size);
}

int main(int argc, char **argv) {
	// RGB: one byte each for red, green, blue

	if (argc != 3 && argc != 4) {
		fprintf(stderr, "format: pgf2jpg input output [orientation]\n");
		return 1;
	}

	unsigned char *pgfbuf, *jpgbuf;
	size_t pgfsize=0, jpgsize=0, jpgwidth=0, jpgheight=0;

	// read the PFG file
	pgfbuf = readFile(argv[1], &pgfsize);
	if (pgfbuf == NULL) {
		fprintf(stderr, "unable to open file %s\n", argv[1]);
		return 1;
	}

	int orientation = ORIENTATION_UNSPECIFIED;
	if (argc == 4)
		orientation = atoi(argv[3]);

	// convert pgf to jpg
	jpgbuf = pgf2jpg (pgfbuf, pgfsize, orientation, &jpgsize, &jpgwidth, &jpgheight);
	if (PGF2JPG_DEBUG)
		printf ("... delete[]    <- pgfbuf(%p)\n", pgfbuf);
	delete[] pgfbuf;

	// save jpg
	writeFile(argv[2], jpgbuf, jpgsize);
	if (PGF2JPG_DEBUG)
		printf ("... delete[]    <- jpgbuf(%p)\n", jpgbuf);
	delete[] jpgbuf;

	return 0;
}
