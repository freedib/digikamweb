openssl req -x509 -newkey rsa:2048 -keyout digikamweb.key -out digikamweb.crt -days 365 -nodes -subj /CN=diblibre.org/O=dibLibre/OU=Renting/C=CA/L=Montreal
openssl x509 -noout -in digikamweb.crt -fingerprint -sha1
