package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"helicone-golang/worker/proxy"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// 设置端口
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}

	// 获取工作类型
	workerType := os.Getenv("WORKER_TYPE")
	if workerType == "" {
		workerType = "OPENAI_PROXY"
	}

	// 创建 Gin 引擎
	r := gin.Default()

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "worker_type": workerType})
	})

	// 根据工作类型设置路由
	switch workerType {
	case "OPENAI_PROXY":
		setupOpenAIProxy(r)
	case "HELICONE_API":
		setupHeliconeAPI(r)
	case "GATEWAY_API":
		setupGatewayAPI(r)
	case "ANTHROPIC_PROXY":
		setupAnthropicProxy(r)
	case "GENERATE_API":
		setupGenerateAPI(r)
	default:
		log.Printf("Unknown worker type: %s, defaulting to OPENAI_PROXY", workerType)
		setupOpenAIProxy(r)
	}

	// 启动服务器
	log.Printf("Worker starting on port %s (type: %s)", port, workerType)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start worker: %v", err)
	}
}

// setupOpenAIProxy 设置 OpenAI 代理
func setupOpenAIProxy(r *gin.Engine) {
	// OpenAI 代理路由
	r.POST("/v1/chat/completions", proxy.OpenAIChatCompletions)
	r.POST("/v1/completions", proxy.OpenAICompletions)
	r.POST("/v1/embeddings", proxy.OpenAIEmbeddings)
	r.GET("/v1/models", proxy.OpenAIModels)
}

// setupHeliconeAPI 设置 Helicone API
func setupHeliconeAPI(r *gin.Engine) {
	// Helicone API 路由
	r.POST("/v1/helicone/log", proxy.LogRequest)
	r.GET("/v1/helicone/requests", proxy.GetRequests)
}

// setupGatewayAPI 设置网关 API
func setupGatewayAPI(r *gin.Engine) {
	// 网关代理路由
	r.Any("/v1/*path", proxy.GatewayProxy)
}

// setupAnthropicProxy 设置 Anthropic 代理
func setupAnthropicProxy(r *gin.Engine) {
	// Anthropic 代理路由
	r.POST("/v1/messages", proxy.AnthropicMessages)
}

// setupGenerateAPI 设置生成 API
func setupGenerateAPI(r *gin.Engine) {
	// 生成 API 路由
	r.POST("/v1/generate", proxy.Generate)
}
