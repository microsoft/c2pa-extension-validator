#!/bin/bash

# NOTE: first generate the test certs by calling generate-cert-chain.sh

cert_types=("trusted" "untrusted")
extensions=("jpg" "mov" "mp4" "png" "webp" "avif" "svg")
audio_extensions=("mp3" "wav")

# sign the test files
for cert_type in "${cert_types[@]}"; do
    certdir="./${cert_type}"
    echo "Signing image/video test files using the $certdir certificates"

    # copy the test manifest file into the cert directory
    cp manifest.json $certdir/

    # sign the image/video files 
    for ext in "${extensions[@]}"; do
        sourceFile="media/cards.$ext"
        outputFile="media/cards_${cert_type}.$ext"
        echo "Signing $sourceFile with the $certdir/manifest.json, output to $outputFile"

        # Sign the test files
        c2patool $sourceFile -m $certdir/manifest.json -o $outputFile -f
    done

    # sign the audio files
    for ext in "${audio_extensions[@]}"; do
        sourceFile="media/cicadas.$ext"
        outputFile="media/cicadas_${cert_type}.$ext"
        echo "Signing $sourceFile with the $certdir/manifest.json, output to $outputFile"

        # Sign the test files
        c2patool $sourceFile -m $certdir/manifest.json -o $outputFile -f
    done

done
