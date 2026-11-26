package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// SiteConfig is the runtime presentation config the server hands the page.
type SiteConfig struct {
	Hero string `json:"hero"` // "request" or "organism"
	Ask  bool   `json:"ask"`
}

// SiteConfigScript serves GET /site-config.js. The page loads it before first
// paint (a blocking script, allowed by the CSP because it is same-origin), so
// switching PORTFOLIO_HERO or PORTFOLIO_ASK on the server takes effect on the
// next page load with no rebuild and no flash of the other variant.
func SiteConfigScript(cfg SiteConfig) gin.HandlerFunc {
	data, _ := json.Marshal(cfg)
	ask := "off"
	if cfg.Ask {
		ask = "on"
	}
	body := []byte("(function(){var c=" + string(data) + ";window.__SITE__=c;" +
		"var r=document.documentElement;r.setAttribute('data-hero',c.hero);r.setAttribute('data-ask','" + ask + "')})();\n")
	return func(c *gin.Context) {
		// Short cache: a config change shows up within a minute even for open tabs' reloads.
		c.Header("Cache-Control", "public, max-age=60")
		c.Data(http.StatusOK, "text/javascript; charset=utf-8", body)
	}
}
