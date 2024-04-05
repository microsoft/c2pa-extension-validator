#!/bin/bash
# This script generates a valid and an untrusted 3-cert ECDSA chains (root -> CA -> signer).
# Leaf cert uses P-256 and is valid for 1 year, CA and root CA use the increasingly stronger
# P-384 and P-521, and are valid for 5 and 10 years, respectively.

# Define an array with the desired directory names
cert_types=("trusted" "untrusted")

# Loop over the array elements
for cert_type in "${cert_types[@]}"; do
    # Use the cert_type value directly as the directory name
    certdir="./${cert_type}"
    # Create the directory if it does not exist
    mkdir -p "$certdir"

    # Generate the self-signed root CA cert
    openssl req -x509 -new -newkey ec:<(openssl ecparam -name secp521r1) -keyout "$certdir/root_CA.key" -out "$certdir/root_CA.crt" -nodes -subj "/O=C2PA Extension Validator/OU=Test/CN=Test Root CA" -days 3650 -config openssl_ca.cnf -extensions v3_ca -sha512

    # Generate the intermediate CA cert request
    openssl req -new -newkey ec:<(openssl ecparam -name secp384r1) -keyout "$certdir/CA.key" -out "$certdir/CA.csr" -nodes -subj "/O=C2PA Extension Validator/OU=Test/CN=Test CA" -config openssl_ca.cnf -extensions v3_ca -sha384

    # Root CA signs the CA cert request
    openssl x509 -req -in "$certdir/CA.csr" -out "$certdir/CA.crt" -CA "$certdir/root_CA.crt" -CAkey "$certdir/root_CA.key" -CAcreateserial -days 1825 -extfile openssl_ca.cnf -extensions v3_ca -sha512

    # Generate the signer cert request
    openssl req -new -newkey ec:<(openssl ecparam -name prime256v1) -keyout "$certdir/signer.key" -out "$certdir/signer.csr" -nodes -subj "/O=C2PA Extension Validator/OU=Test/CN=Test Signer" -config openssl_ca.cnf -extensions v3_signer -sha256

    # Intermediate CA signs the signer cert request
    openssl x509 -req -in "$certdir/signer.csr" -out "$certdir/signer.crt" -CA "$certdir/CA.crt" -CAkey "$certdir/CA.key" -CAcreateserial -days 365 -extfile openssl_ca.cnf -extensions v3_signer -sha384

    # Concatenate certificates to form the chain
    cat "$certdir/signer.crt" "$certdir/CA.crt" "$certdir/root_CA.crt" > "$certdir/chain.pem"
done

# print information to add to trust list
fingerprint=$(openssl x509 -in trusted/signer.crt -sha256 -noout -fingerprint | tr -d ':' | tr 'A-Z' 'a-z')
echo "_____"
echo "Add the trusted signer certificate thumbprint to the test trust list: $fingerprint"