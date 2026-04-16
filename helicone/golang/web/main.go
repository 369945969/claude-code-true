package main

import (
	"html/template"
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// 设置端口
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	// 设置静态文件目录
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// 设置模板
	http.HandleFunc("/", handleHome)
	http.HandleFunc("/dashboard", handleDashboard)
	http.HandleFunc("/requests", handleRequests)
	http.HandleFunc("/settings", handleSettings)
	http.HandleFunc("/api/", handleAPI)

	// 启动服务器
	log.Printf("Web UI starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start web server: %v", err)
	}
}

func handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	tmpl := template.Must(template.ParseFiles("templates/index.html"))
	tmpl.Execute(w, nil)
}

func handleDashboard(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles("templates/dashboard.html"))
	tmpl.Execute(w, nil)
}

func handleRequests(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles("templates/requests.html"))
	tmpl.Execute(w, nil)
}

func handleSettings(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles("templates/settings.html"))
	tmpl.Execute(w, nil)
}

func handleAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "ok"}`))
}
