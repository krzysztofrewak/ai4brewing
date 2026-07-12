const X_CATEGORIES = [
    "general process",
    "materials & laboratory",
    "planning & preparing",
    "mashing, lautering, boiling & cooling",
    "fermentation",
    "bottling",
    "quality assurance",
]

const Y_CATEGORIES = [
    "classical methods",
    "neural networks",
    "computer vision",
    "LLM & MAS",
    "Industry 4.0 & digital twins",
    "review",
]

function computeAboutStats(entries) {
    const withPosition = entries.filter(e => e.meta && e.meta.position)
    const total = withPosition.length

    const isBoundary = p => p.x !== Math.trunc(p.x) || p.y !== Math.trunc(p.y)
    const boundaryTotal = withPosition.filter(e => isBoundary(e.meta.position)).length
    const stageBoundary = withPosition.filter(e => {
        const x = e.meta.position.x
        return x !== Math.trunc(x)
    }).length

    // The Y axis is stored inverted relative to Y_CATEGORIES: index 0 renders
    // at the top of the chart, which corresponds to the highest data y value.
    const yPos = name => (Y_CATEGORIES.length - 1) - Y_CATEGORIES.indexOf(name)

    const countAtY = y => withPosition.filter(e => e.meta.position.y === y).length
    const countAtXExact = name => {
        const x = X_CATEGORIES.indexOf(name)
        return withPosition.filter(e => e.meta.position.x === x).length
    }
    const countAtYExact = name => countAtY(yPos(name))

    const cvNnBoundary = countAtY((yPos("computer vision") + yPos("neural networks")) / 2)
    const nnClassicalBoundary = countAtY((yPos("neural networks") + yPos("classical methods")) / 2)

    return {
        total,
        boundaryTotal,
        cvNnBoundary,
        nnClassicalBoundary,
        stageBoundary,
        qualityAssuranceCount: countAtXExact("quality assurance"),
        fermentationCount: countAtXExact("fermentation"),
        neuralNetworksCount: countAtYExact("neural networks"),
    }
}

function computeEraStats(entries) {
    const withYear = entries
        .map(e => ({ e, year: parseInt(e.fields?.year, 10) }))
        .filter(x => Number.isFinite(x.year))

    const earlyCount = withYear.filter(x => x.year <= 2004).length
    const laterCount = withYear.filter(x => x.year >= 2017).length

    const counts = new Map()
    withYear.forEach(x => counts.set(x.year, (counts.get(x.year) || 0) + 1))
    const topYears = Array.from(counts, ([year, count]) => ({ year, count }))
        .sort((a, b) => b.count - a.count || a.year - b.year)
        .slice(0, 2)
        .sort((a, b) => a.year - b.year)

    return {
        earlyCount,
        laterCount,
        peakYearA: topYears[0]?.year,
        peakCountA: topYears[0]?.count,
        peakYearB: topYears[1]?.year,
        peakCountB: topYears[1]?.count,
    }
}

function wrapCanvasText(ctx, text, maxWidth) {
    const words = text.split(" ")
    const lines = []
    let line = ""
    words.forEach(word => {
        const test = line ? `${line} ${word}` : word
        if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line)
            line = word
        } else {
            line = test
        }
    })
    if (line) lines.push(line)
    return lines
}

function computeMapNodes(entries, sourceNameFn) {
    const withPosition = entries.filter(e => e.meta && e.meta.position)

    const groups = new Map()
    withPosition.forEach(e => {
        const key = `${e.meta.position.x},${e.meta.position.y}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(e)
    })

    const MAX_PER_ROW = 5
    const COL_GAP = 0.14
    const ROW_GAP = 0.22

    return withPosition.map(entry => {
        const baseX = entry.meta.position.x
        const baseY = entry.meta.position.y
        const group = groups.get(`${baseX},${baseY}`)
        const authors = (entry.fields.author || "").split(", ").map(a => a.trim()).filter(Boolean)

        const node = {
            key: entry.key,
            title: entry.fields.title || "—",
            authors,
            year: entry.fields.year || "",
            country: entry.meta.country || "",
            source: sourceNameFn(entry),
            url: entry.fields.doi ? `https://doi.org/${entry.fields.doi}` : (entry.fields.url || ""),
            references: Array.isArray(entry.meta.references) ? entry.meta.references : [],
        }

        if (group.length === 1) {
            return { ...node, x: baseX, y: baseY }
        }

        const indexInGroup = group.indexOf(entry)
        const n = group.length

        const numRows = Math.ceil(n / MAX_PER_ROW)
        const rowStart = Math.floor(indexInGroup / MAX_PER_ROW) * MAX_PER_ROW
        const row = rowStart / MAX_PER_ROW
        const itemsInRow = Math.min(MAX_PER_ROW, n - rowStart)
        const col = indexInGroup - rowStart

        const dx = (col - (itemsInRow - 1) / 2) * COL_GAP
        const dy = (row - (numRows - 1) / 2) * ROW_GAP

        return { ...node, x: baseX + dx, y: baseY + dy }
    })
}

window.mapMethods = {
    mapNodes: [],
    mapChart: null,
    mapActiveKey: null,

    renderMap() {
        if (this.mapChart) {
            this.mapChart.resize()
            return
        }
        const canvas = document.getElementById("mapChart")
        if (!canvas || !this.mapNodes.length) return

        this.mapChart = new Chart(canvas.getContext("2d"), {
            type: "bubble",
            data: {
                datasets: [{
                    data: this.mapNodes.map(n => ({ x: n.x, y: n.y, r: 6, _meta: n })),
                    parsing: { xKey: "x", yKey: "y", rKey: "r" },
                    backgroundColor: c => this.mapPointColor(c, false),
                    borderColor: c => this.mapPointColor(c, true),
                    borderWidth: 2,
                }],
            },
            options: this.mapChartOptions(),
            plugins: [this.mapGridPlugin(), this.mapConnectionsPlugin()],
        })

        if (!this.mapResizeBound) {
            this.mapResizeBound = true
            let resizeTimer = null
            window.addEventListener("resize", () => {
                clearTimeout(resizeTimer)
                resizeTimer = setTimeout(() => {
                    if (!this.mapChart) return
                    this.mapChart.options.layout.padding = this.mapChartOptions().layout.padding
                    this.mapChart.resize()
                    this.mapChart.update()
                }, 150)
            })
        }
    },

    mapCitesFromActive(n) {
        if (!this.mapActiveKey) return false
        const active = this.mapNodes.find(x => x.key === this.mapActiveKey)
        return Array.isArray(active?.references) && active.references.includes(n.key)
    },

    mapCitesToActive(n) {
        if (!this.mapActiveKey) return false
        return Array.isArray(n.references) && n.references.includes(this.mapActiveKey)
    },

    mapPointColor(ctx, border) {
        const n = ctx.raw?._meta
        if (!n) return border ? "rgb(156,156,156)" : "rgba(156,156,156,0.6)"

        if (!this.mapActiveKey) {
            return border ? "rgb(156,156,156)" : "rgba(156,156,156,0.6)"
        }

        if (n.key === this.mapActiveKey) return border ? "rgba(99,102,241,1)" : "rgba(99,102,241,0.9)"
        if (this.mapCitesFromActive(n)) return border ? "rgba(59,130,246,1)" : "rgba(59,130,246,0.8)"
        if (this.mapCitesToActive(n)) return border ? "rgba(168,85,247,1)" : "rgba(168,85,247,0.8)"

        return border ? "rgba(200,200,200,0.3)" : "rgba(200,200,200,0.15)"
    },

    mapChartOptions() {
        const narrow = window.innerWidth < 640
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: narrow
                    ? { left: 100, right: 16, top: 16, bottom: 130 }
                    : { left: 180, right: 40, top: 20, bottom: 70 },
            },
            scales: {
                x: { display: false, min: -0.5, max: X_CATEGORIES.length - 0.5 },
                y: { display: false, min: -0.5, max: Y_CATEGORIES.length - 0.5 },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 12,
                    boxPadding: 8,
                    usePointStyle: true,
                    callbacks: {
                        title: items => items?.[0]?.raw?._meta?.title ?? "Publication",
                        label: item => {
                            const n = item.raw?._meta
                            return [
                                `Authors: ${n.authors.join(", ")}`,
                                `Year: ${n.year}`,
                                `Source: ${n.source}`,
                            ]
                        },
                    },
                },
            },
            onClick: (event, elements) => {
                if (!elements?.length) {
                    this.mapActiveKey = null
                    event.chart.setActiveElements([])
                    event.chart.update()
                    return
                }

                const n = elements[0].element.$context.raw._meta
                if (this.mapActiveKey === n.key) {
                    if (n.url) window.open(n.url, "_blank", "noopener,noreferrer")
                    return
                }

                this.mapActiveKey = n.key
                event.chart.update()
            },
            elements: {
                point: {
                    hoverBorderWidth: 2,
                    hoverBorderColor: "#fff",
                },
            },
        }
    },

    mapGridPlugin() {
        return {
            id: "grid",
            beforeDraw: chart => {
                const { ctx, chartArea } = chart
                const narrow = window.innerWidth < 640
                const cw = chartArea.width / X_CATEGORIES.length
                const ch = chartArea.height / Y_CATEGORIES.length

                ctx.save()
                ctx.strokeStyle = "rgba(170,170,170,0.2)"
                ctx.lineWidth = 1

                for (let i = 0; i <= X_CATEGORIES.length; i++) {
                    const x = chartArea.left + i * cw
                    ctx.beginPath()
                    ctx.moveTo(x, chartArea.top)
                    ctx.lineTo(x, chartArea.bottom)
                    ctx.stroke()
                }

                for (let j = 0; j <= Y_CATEGORIES.length; j++) {
                    const y = chartArea.top + j * ch
                    ctx.beginPath()
                    ctx.moveTo(chartArea.left, y)
                    ctx.lineTo(chartArea.right, y)
                    ctx.stroke()
                }

                ctx.fillStyle = "#475569"
                ctx.font = narrow ? "10px system-ui" : "12px system-ui"

                if (narrow) {
                    ctx.textAlign = "right"
                    ctx.textBaseline = "middle"
                    X_CATEGORIES.forEach((c, i) => {
                        const x = chartArea.left + (i + 0.5) * cw
                        ctx.save()
                        ctx.translate(x, chartArea.bottom + 10)
                        ctx.rotate(-Math.PI / 4)
                        ctx.fillText(c, 0, 0)
                        ctx.restore()
                    })
                } else {
                    ctx.textAlign = "center"
                    ctx.textBaseline = "top"
                    X_CATEGORIES.forEach((c, i) => {
                        ctx.fillText(c, chartArea.left + (i + 0.5) * cw, chartArea.bottom + 10)
                    })
                }

                if (narrow) {
                    ctx.textAlign = "right"
                    ctx.textBaseline = "middle"
                    const maxWidth = Math.max(chartArea.left - 12, 40)
                    const lineHeight = 11
                    Y_CATEGORIES.forEach((c, j) => {
                        const lines = wrapCanvasText(ctx, c, maxWidth)
                        const cy = chartArea.top + (j + 0.5) * ch
                        const startY = cy - ((lines.length - 1) * lineHeight) / 2
                        lines.forEach((line, li) => {
                            ctx.fillText(line, chartArea.left - 8, startY + li * lineHeight)
                        })
                    })
                } else {
                    ctx.textAlign = "right"
                    ctx.textBaseline = "middle"
                    Y_CATEGORIES.forEach((c, j) => {
                        ctx.fillText(c, chartArea.left - 8, chartArea.top + (j + 0.5) * ch)
                    })
                }

                ctx.restore()
            },
        }
    },

    mapConnectionsPlugin() {
        return {
            id: "connections",
            afterDatasetsDraw: chart => {
                const ctx = chart.ctx
                const data = chart.data.datasets[0].data
                const meta = chart.getDatasetMeta(0)

                ctx.save()

                data.forEach((point, i) => {
                    const n = point._meta
                    if (!Array.isArray(n.references)) return

                    const source = meta.data[i]

                    n.references.forEach(refKey => {
                        const ti = data.findIndex(d => d._meta?.key === refKey)
                        if (ti === -1) return

                        let color = "rgba(156,156,156,0.15)"
                        let width = 1

                        if (this.mapActiveKey) {
                            if (n.key === this.mapActiveKey) {
                                color = "rgba(59,130,246,0.9)"
                                width = 2.5
                            } else if (refKey === this.mapActiveKey) {
                                color = "rgba(168,85,247,0.9)"
                                width = 2.5
                            }
                        }

                        ctx.strokeStyle = color
                        ctx.lineWidth = width
                        this.drawMapConnection(ctx, source, meta.data[ti])
                    })
                })

                ctx.restore()
            },
        }
    },

    drawMapConnection(ctx, source, target) {
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.hypot(dx, dy)
        if (!dist) return

        const rs = source.options.radius || 0
        const rt = target.options.radius || 0

        const sx = source.x + (dx / dist) * rs
        const sy = source.y + (dy / dist) * rs
        const ex = target.x - (dx / dist) * rt
        const ey = target.y - (dy / dist) * rt

        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.stroke()

        const angle = Math.atan2(dy, dx)
        const size = 10

        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - size * Math.cos(angle - Math.PI / 6), ey - size * Math.sin(angle - Math.PI / 6))
        ctx.lineTo(ex - size * Math.cos(angle + Math.PI / 6), ey - size * Math.sin(angle + Math.PI / 6))
        ctx.closePath()
        ctx.fillStyle = ctx.strokeStyle
        ctx.fill()
    },
}
