#!/bin/bash

# NOTE: first generate the test certs by calling generate-cert-chain.sh

cert_types=("trusted" "untrusted")
extensions=("jpg" "mov" "mp4" "png" "webp")

# sign the test files
for cert_type in "${cert_types[@]}"; do
    certdir="./${cert_type}" # This specifies the certificate directory.
    echo "Signing test files using the $certdir certificates"

    # copy the test manifests file into the cert directory
    cp manifest_with_tsa.json $certdir/
    cp manifest_without_tsa.json $certdir/

    for ext in "${extensions[@]}"; do
        sourceFile="media/cards.$ext"
        outputFile="media/cards_${cert_type}.$ext" # Modified to use cert_type directly
        echo "Signing $sourceFile with the $certdir/manifest_with_tsa.json, output to $outputFile"

        # Sign the test files
        c2patool $sourceFile -m $certdir/manifest_with_tsa.json -o $outputFile -f
    done
done

# sign the test files using the soon-to-expire certificate
sourceFile="media/cards.jpg"
# 1. sign with a time-stamp (asset will remain valid past expiration)
outputFile="media/cards_expired_with_timestamp.jpg"
manifestFile="trusted/manifest_with_tsa.json"
echo "Signing $sourceFile with the $manifestFile, output to $outputFile"
c2patool $sourceFile -m $manifestFile -o $outputFile -f
# 2. sign without a time-stamp (asset will remain be invalid past expiration)
outputFile="media/cards_expired_without_timestamp.jpg"
manifestFile="trusted/manifest_without_tsa.json"
echo "Signing $sourceFile with the $manifestFile, output to $outputFile"
c2patool $sourceFile -m $manifestFile -o $outputFile -f
