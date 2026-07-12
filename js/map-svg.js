function escapeXml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

window.mapSvgMethods = {
    exportMapSVG() {
        if (!this.mapNodes.length) return

        const cols = X_CATEGORIES.length
        const rows = Y_CATEGORIES.length
        const left = 50
        const right = 30
        const top = 30
        const bottom = 50
        const width = 800
        const height = 750
        const chartW = width - left - right
        const chartH = height - top - bottom
        const radius = 6

        const px = x => left + ((x + 0.5) / cols) * chartW
        const py = y => top + chartH - ((y + 0.5) / rows) * chartH

        const parts = []
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`)
        parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`)

        for (let i = 0; i <= cols; i++) {
            const x = left + (i / cols) * chartW
            parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + chartH}" stroke="#d1d5db" stroke-width="1"/>`)
        }
        for (let j = 0; j <= rows; j++) {
            const y = top + (j / rows) * chartH
            parts.push(`<line x1="${left}" y1="${y}" x2="${left + chartW}" y2="${y}" stroke="#d1d5db" stroke-width="1"/>`)
        }

        X_CATEGORIES.forEach((label, i) => {
            const x = px(i)
            const letter = String.fromCharCode(65 + i)
            parts.push(`<text x="${x.toFixed(1)}" y="${top + chartH + 24}" font-size="12" fill="#475569" text-anchor="middle">${letter}</text>`)
        })
        Y_CATEGORIES.forEach((label, j) => {
            const y = py(j)
            parts.push(`<text x="${left - 10}" y="${(y + 4).toFixed(1)}" font-size="12" fill="#475569" text-anchor="end">${j + 1}</text>`)
        })

        const nodeByKey = new Map(this.mapNodes.map(n => [n.key, n]))
        this.mapNodes.forEach(n => {
            (n.references || []).forEach(refKey => {
                const target = nodeByKey.get(refKey)
                if (!target) return

                const sx = px(n.x)
                const sy = py(n.y)
                const tx = px(target.x)
                const ty = py(target.y)
                const dx = tx - sx
                const dy = ty - sy
                const dist = Math.hypot(dx, dy)
                if (!dist) return

                const ux = dx / dist
                const uy = dy / dist
                const startX = sx + ux * radius
                const startY = sy + uy * radius
                const endX = tx - ux * radius
                const endY = ty - uy * radius

                parts.push(`<line x1="${startX.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" stroke-opacity="0.35"/>`)

                const angle = Math.atan2(dy, dx)
                const size = 8
                const ax1 = endX - size * Math.cos(angle - Math.PI / 6)
                const ay1 = endY - size * Math.sin(angle - Math.PI / 6)
                const ax2 = endX - size * Math.cos(angle + Math.PI / 6)
                const ay2 = endY - size * Math.sin(angle + Math.PI / 6)
                parts.push(`<polygon points="${endX.toFixed(1)},${endY.toFixed(1)} ${ax1.toFixed(1)},${ay1.toFixed(1)} ${ax2.toFixed(1)},${ay2.toFixed(1)}" fill="#94a3b8" fill-opacity="0.35"/>`)
            })
        })

        this.mapNodes.forEach(n => {
            const cx = px(n.x)
            const cy = py(n.y)
            parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius}" fill="#9ca3af" stroke="#6b7280" stroke-width="1.5"><title>${escapeXml(n.title)}</title></circle>`)
        })

        parts.push("</svg>")

        const blob = new Blob([parts.join("\n")], { type: "image/svg+xml" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "publication-map.svg"
        a.click()
        URL.revokeObjectURL(url)
    },
}
