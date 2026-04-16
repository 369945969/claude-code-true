package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"helicone-golang/api/handlers"
	"helicone-golang/api/middleware"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// 设置端口
	port := os.Getenv("PORT")
	if port == "" {
		port = "8585"
	}

	// 创建 Gin 引擎
	r := gin.Default()

	// 中间件
	r.Use(middleware.CORS())
	r.Use(middleware.Logger())

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 公共路由
	public := r.Group("/v1")
	{
		public.POST("/chat/completions", handlers.ChatCompletions)
		public.POST("/completions", handlers.Completions)
		public.GET("/models", handlers.ListModels)
	}

	// 需要认证的路由
	auth := r.Group("")
	auth.Use(middleware.AuthMiddleware())
	{
		// Helicone 特定的 API 端点
		auth.GET("/helicone/requests", handlers.GetRequests)
		auth.POST("/helicone/settings", handlers.UpdateSettings)
		auth.GET("/helicone/stats", handlers.GetStats)
		auth.GET("/helicone/users", handlers.ListUsers)
		auth.POST("/helicone/api-keys", handlers.CreateAPIKey)
		auth.GET("/helicone/api-keys", handlers.ListAPIKeys)
		auth.DELETE("/helicone/api-keys/:keyId", handlers.DeleteAPIKey)
	}

	// 启动服务器
	log.Printf("Jawn API starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
