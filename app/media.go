package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/image/draw"
	_ "image/gif"
	_ "image/png"
)

func thumbnailFilename(filename, size string) string {
	ext := filepath.Ext(filename)
	name := strings.TrimSuffix(filename, ext)
	if name == "" {
		name = imageID()
	}
	return fmt.Sprintf("%s_%s.jpg", name, size)
}

func buildThumbnailFromBytes(source []byte, dstPath string, maxWidth int) error {
	img, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return err
	}
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	if w <= 0 || h <= 0 {
		return fmt.Errorf("invalid image size")
	}
	targetW := w
	targetH := h
	if maxWidth > 0 && w > maxWidth {
		targetW = maxWidth
		targetH = int(float64(h) * (float64(maxWidth) / float64(w)))
		if targetH < 1 {
			targetH = 1
		}
	}
	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)

	if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer out.Close()
	return jpeg.Encode(out, dst, &jpeg.Options{Quality: thumbJPEGQuality})
}

func makeThumbURLs(source []byte, filename string) (string, string, string) {
	smallName := thumbnailFilename(filename, "sm")
	mediumName := thumbnailFilename(filename, "md")
	smallPath := filepath.Join(thumbsDir, smallName)
	mediumPath := filepath.Join(thumbsDir, mediumName)

	smallURL := ""
	mediumURL := ""
	if err := buildThumbnailFromBytes(source, smallPath, thumbSmallMaxWidth); err == nil {
		smallURL = thumbPrefix + smallName
	}
	if err := buildThumbnailFromBytes(source, mediumPath, thumbMediumMaxWidth); err == nil {
		mediumURL = thumbPrefix + mediumName
	}
	thumbURL := mediumURL
	if thumbURL == "" {
		thumbURL = smallURL
	}
	return thumbURL, smallURL, mediumURL
}

func saveUploadedFile(file multipart.File, header *multipart.FileHeader) (string, string, string, string, string, int64, error) {
	defer file.Close()
	id := imageID()
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".jpg"
	}
	filename := id + ext
	fullpath := filepath.Join(uploadsDir, filename)
	out, err := os.Create(fullpath)
	if err != nil {
		return "", "", "", "", "", 0, err
	}
	data, err := io.ReadAll(file)
	if err != nil {
		out.Close()
		return "", "", "", "", "", 0, err
	}
	if _, err := out.Write(data); err != nil {
		out.Close()
		return "", "", "", "", "", 0, err
	}
	out.Close()

	thumbURL, thumbSmallURL, thumbMediumURL := makeThumbURLs(data, filename)
	return filename, publicPrefix + filename, thumbURL, thumbSmallURL, thumbMediumURL, int64(len(data)), nil
}

func saveBase64Image(dataURL, preferredName string) (string, string, string, string, string, int64, error) {
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return "", "", "", "", "", 0, fmt.Errorf("invalid data url")
	}
	payload := parts[1]
	bytesData, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", "", "", "", "", 0, err
	}
	filename := imageID() + ".png"
	fullpath := filepath.Join(uploadsDir, filename)
	if err := os.WriteFile(fullpath, bytesData, 0o644); err != nil {
		return "", "", "", "", "", 0, err
	}
	thumbURL, thumbSmallURL, thumbMediumURL := makeThumbURLs(bytesData, filename)
	return filename, publicPrefix + filename, thumbURL, thumbSmallURL, thumbMediumURL, int64(len(bytesData)), nil
}
