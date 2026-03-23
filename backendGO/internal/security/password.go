package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"

	"golang.org/x/crypto/scrypt"
)

var (
	uppercasePattern = regexp.MustCompile(`[A-Z]`)
	lowercasePattern = regexp.MustCompile(`[a-z]`)
	numberPattern    = regexp.MustCompile(`\d`)
	specialPattern   = regexp.MustCompile(`[!@#$%^&*()_\-+=\[{\]};:'",.<>/?\\|` + "`" + `~]`)
)

func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash, err := scrypt.Key([]byte(password), salt, 1<<14, 8, 1, 32)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("scrypt$16384$8$1$%s$%s", b64Encode(salt), b64Encode(hash)), nil
}

func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "scrypt" {
		return false
	}
	salt, err := b64Decode(parts[4])
	if err != nil {
		return false
	}
	expected, err := b64Decode(parts[5])
	if err != nil {
		return false
	}
	calculated, err := scrypt.Key([]byte(password), salt, 16384, 8, 1, len(expected))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(expected, calculated) == 1
}

func ValidatePasswordPolicy(password string) error {
	switch {
	case len(password) < 8:
		return fmt.Errorf("password must be at least 8 characters")
	case !uppercasePattern.MatchString(password):
		return fmt.Errorf("password must include at least one uppercase letter")
	case !lowercasePattern.MatchString(password):
		return fmt.Errorf("password must include at least one lowercase letter")
	case !numberPattern.MatchString(password):
		return fmt.Errorf("password must include at least one number")
	case !specialPattern.MatchString(password):
		return fmt.Errorf("password must include at least one special character")
	default:
		return nil
	}
}

func b64Encode(value []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(value), "=")
}

func b64Decode(value string) ([]byte, error) {
	padding := len(value) % 4
	if padding != 0 {
		value += strings.Repeat("=", 4-padding)
	}
	return base64.URLEncoding.DecodeString(value)
}
