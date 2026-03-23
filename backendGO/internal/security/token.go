package security

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenClaims struct {
	Role      string  `json:"role"`
	TeacherID *string `json:"teacher_id"`
	jwt.RegisteredClaims
}

func CreateAccessToken(secretKey, userCode, role string, teacherID *string, expiresMinutes int) (string, error) {
	claims := TokenClaims{
		Role:      role,
		TeacherID: teacherID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userCode,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(expiresMinutes) * time.Minute)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secretKey))
}

func DecodeAccessToken(secretKey, tokenString string) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (any, error) {
		return []byte(secretKey), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid || claims.Subject == "" {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}
