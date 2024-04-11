#!/bin/bash

# NOTE: first generate the test certs by calling generate-cert-chain.sh

cert_types=("trusted" "untrusted")
extensions=("jpg" "mov" "mp4" "png" "webp")

# sign the test files
for cert_type in "${cert_types[@]}"; do
    certdir="./${cert_type}" # This specifies the certificate directory.
    echo "Signing test files using the $certdir certificates"

    # copy the test manifest file into the cert directory
    cp manifest.json $certdir/

    for ext in "${extensions[@]}"; do
        sourceFile="media/cards.$ext"
        outputFile="media/cards_${cert_type}.$ext" # Modified to use cert_type directly
        echo "Signing $sourceFile with the $certdir/manifest.json, output to $outputFile"

        # Sign the test files
        c2patool $sourceFile -m $certdir/manifest.json -o $outputFile -f
    done
done