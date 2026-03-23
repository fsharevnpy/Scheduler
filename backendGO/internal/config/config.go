package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL              string
	SecretKey                string
	Port                     string
	AccessTokenExpireMinutes int
	DefaultNewUserPassword   string
	DefaultResetUserPassword string
}

func Load() Config {
	return Config{
		DatabaseURL:              getEnv("DATABASE_URL", "postgresql://chessfighter:123456@localhost:5432/scheduler"),
		SecretKey:                getEnv("SECRET_KEY", "change-this-secret-in-production"),
		Port:                     getEnv("PORT", "8000"),
		AccessTokenExpireMinutes: getEnvInt("ACCESS_TOKEN_EXPIRE_MINUTES", 60),
		DefaultNewUserPassword:   getEnv("DEFAULT_NEW_USER_PASSWORD", "123456aA@"),
		DefaultResetUserPassword: getEnv("DEFAULT_RESET_USER_PASSWORD", "123456aA@"),
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
