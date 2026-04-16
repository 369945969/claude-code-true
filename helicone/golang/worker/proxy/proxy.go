package proxy

import (
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// 反向代理实例
var (
	openaiProxy     *httputil.ReverseProxy
	anthropicProxy  *httputil.ReverseProxy
	gatewayProxy    *httputil.ReverseProxy
)

func init() {
	// 初始化 OpenAI 代理
	if openaiURL := os.Getenv("OPENAI_URL"); openaiURL != "" {
		if parsed, err := url.Parse(openaiURL); err == nil {
			openaiProxy = httputil.NewSingleHostReverseProxy(parsed)
		}
	}

	// 初始化 Anthropic 代理
	if anthropicURL := os.Getenv("ANTHROPIC_URL"); anthropicURL != "" {
		if parsed, err := url.Parse(anthropicURL); err == nil {
			anthropicProxy = httputil.NewSingleHostReverseProxy(parsed)
		}
	}

	// 初始化网关代理
	if gatewayURL := os.Getenv("GATEWAY_TARGET"); gatewayURL != "" {
		if parsed, err := url.Parse(gatewayURL); err == nil {
			gatewayProxy = httputil.NewSingleHostReverseProxy(parsed)
		}
	}
}

// OpenAIChatCompletions 处理 OpenAI 聊天完成请求
func OpenAIChatCompletions(c *gin.Context) {
	if openaiProxy == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "OpenAI proxy not configured"})
		return
	}

	// 记录请求
	logRequest(c)

	// 转发请求
	openaiProxy.ServeHTTP(c.Writer, c.Request)
}

// OpenAICompletions 处理 OpenAI 补全请求
func OpenAICompletions(c *gin.Context) {
	if openaiProxy == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "OpenAI proxy not configured"})
		return
	}

	openaiProxy.ServeHTTP(c.Writer, c.Request)
}

// OpenAIEmbeddings 处理 OpenAI 嵌入请求
func OpenAIEmbeddings(c *gin.Context) {
	if openaiProxy == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "OpenAI proxy not configured"})
		return
	}

	openaiProxy.ServeHTTP(c.Writer, c.Request)
}

// OpenAIModels 处理 OpenAI 模型列表请求
func OpenAIModels(c *gin.Context) {
	if openaiProxy == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "OpenAI proxy not configured"})
		return
	}

	openaiProxy.ServeHTTP(c.Writer, c.Request)
}

// AnthropicMessages 处理 Anthropic 消息请求
func AnthropicMessages(c *gin.Context) {
	if anthropicProxy == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Anthropic proxy not configured"})
		return
	}

	logRequest(c)
	anthropicProxy.ServeHTTP(c.Writer, c.Request)
}

// GatewayProxy 通用网关代理
func GatewayProxy(c *gin.Context) {
	if gatewayProxy == nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Gateway proxy not configured"})
		return
	}

	logRequest(c)
	gatewayProxy.ServeHTTP(c.Writer, c.Request)
}

// LogRequest 记录请求
func LogRequest(c *gin.Context) {
	// 读取请求体
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read request body"})
		return
	}
	c.Request.Body = io.NopCloser(io.Reader(&body))

	// 记录到 ClickHouse/MinIO
	// 这里简化处理
	c.JSON(http.StatusOK, gin.H{"status": "logged"})
}

// GetRequests 获取请求列表
func GetRequests(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"requests": []interface{}{}})
}

// Generate 处理生成请求
func Generate(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Generate endpoint - to be implemented"})
}

// logRequest 记录请求详情
func logRequest(c *gin.Context) {
	// 在实际实现中，这里应该：
	// 1. 记录请求到 ClickHouse
	// 2. 存储请求/响应到 MinIO
	// 3. 更新使用统计
	// 4. 应用速率限制
}
