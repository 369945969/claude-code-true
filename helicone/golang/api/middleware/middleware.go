package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS 跨域中间件
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Helicone-Api-Key")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		
		c.Next()
	}
}

// Logger 日志中间件
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 简单的请求日志
		// 在实际实现中，应该记录到 ClickHouse 或文件
		c.Next()
	}
}

// AuthMiddleware 认证中间件
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从 Header 获取 API Key
		apiKey := c.GetHeader("X-Helicone-Api-Key")
		if apiKey == "" {
			apiKey = c.Query("api_key")
		}
		
		// 验证 API Key
		if !validateAPIKey(apiKey) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API key"})
			c.Abort()
			return
		}
		
		c.Next()
	}
}

// validateAPIKey 验证 API 密钥
func validateAPIKey(apiKey string) bool {
	if apiKey == "" {
		return false
	}
	
	// 这里应该从数据库验证 API Key
	// 简化版本：检查前缀
	if strings.HasPrefix(apiKey, "sk-helicone-") {
		return true
	}
	
	return false
}
