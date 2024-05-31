#!/bin/bash

# NOTE: first generate the test certs by calling generate-cert-chain.sh

cert_types=("trusted" "untrusted")
extensions=("jpg" "mov" "mp4" "png" "webp")

# sign the test files
for cert_type in "${cert_types[@]}"; do
    certdir="./${cert_type}" # This specifies the certificate directory.
    echo "Signing test files using the $certdir certificates"

    # copy the test manifests file into the cert directory
    cp manifest_with_ta.json $certdir/
    cp manifest_without_ta.json $certdir/

    for ext in "${extensions[@]}"; do
        sourceFile="media/cards.$ext"
        outputFile="media/cards_${cert_type}.$ext" # Modified to use cert_type directly
        echo "Signing $sourceFile with the $certdir/manifest_with_ta.json, output to $outputFile"

        # Sign the test files
        c2patool $sourceFile -m $certdir/manifest_with_ta.json -o $outputFile -f
    done
done

# sign the files for validity period tests
sourceFile="media/cards.jpg"
cp manifest_with_ta.json expired/
cp manifest_without_ta.json expired/
# 1. sign with a time-stamp and soon-to-expire cert (asset will remain valid past expiration)
outputFile="media/cards_expired_with_timestamp.jpg"
manifestFile="expired/manifest_with_ta.json"
echo "Signing $sourceFile with the $manifestFile, output to $outputFile"
c2patool $sourceFile -m $manifestFile -o $outputFile -f
# 2. sign without a time-stamp and soon-to-expire cert (asset will be invalid past expiration)
outputFile="media/cards_expired_without_timestamp.jpg"
manifestFile="expired/manifest_without_ta.json"
echo "Signing $sourceFile with the $manifestFile, output to $outputFile"
c2patool $sourceFile -m $manifestFile -o $outputFile -f
# 3. sign without a time-stamp and valid cert (asset will be valid during cert validity period)
outputFile="media/cards_trusted_without_timestamp.jpg"
manifestFile="trusted/manifest_without_ta.json"
echo "Signing $sourceFile with the $manifestFile, output to $outputFile"
c2patool $sourceFile -m $manifestFile -o $outputFile -f
# 4. sign with an untrusted time-stamp and soon-to-expire cert (asset will be invalid past expiration)
outputFile="media/cards_expired_with_untrusted_timestamp.jpg"
manifestFile="expired/manifest_with_untrusted_ta.json"
echo "Signing $sourceFile with the $manifestFile, output to $outputFile"
c2patool $sourceFile -m $manifestFile -o $outputFile -f