function cleanValue(value) {
    let v = (value || "").trim()
    if (v.startsWith("{") && v.endsWith("}")) {
        v = v.slice(1, -1).trim()
    }
    return v
        .replace(/\\&/g, "&")
        .replace(/\\%/g, "%")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim()
}

function foldText(value) {
    return (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
}

function formatAuthorName(segment) {
    const trimmed = segment.trim()
    const commaIndex = trimmed.indexOf(",")
    if (commaIndex === -1) return trimmed
    const last = trimmed.slice(0, commaIndex).trim()
    const first = trimmed.slice(commaIndex + 1).trim()
    return first ? `${first} ${last}` : last
}

function normalizeEntry(raw) {
    const tags = raw.entryTags || {}
    const fields = {}
    for (const name in tags) {
        fields[name.toLowerCase()] = cleanValue(tags[name])
    }
    if (fields.author) {
        fields.author = fields.author.split(" and ").map(a => formatAuthorName(a)).join(", ")
    }
    if (fields.editor) {
        fields.editor = fields.editor.split(" and ").map(a => a.trim()).join(", ")
    }
    return {
        key: raw.citationKey,
        type: (raw.entryType || "").toLowerCase(),
        fields,
        meta: {},
    }
}

const COUNTRY_NAMES = {
    ar: "Argentina", at: "Austria", au: "Australia", be: "Belgium",
    bg: "Bulgaria", br: "Brazil", ca: "Canada", ch: "Switzerland",
    ci: "Ivory Coast", cl: "Chile", cn: "China", cz: "Czechia",
    de: "Germany", dk: "Denmark", ec: "Ecuador", es: "Spain",
    et: "Ethiopia", fi: "Finland", fr: "France", gb: "United Kingdom",
    gr: "Greece", hr: "Croatia", hu: "Hungary", ie: "Ireland",
    ir: "Iran", it: "Italy", kr: "South Korea", mx: "Mexico",
    my: "Malaysia", ng: "Nigeria", nl: "Netherlands", pl: "Poland",
    pt: "Portugal", ro: "Romania", rs: "Serbia", ru: "Russia",
    se: "Sweden", th: "Thailand", tt: "Trinidad and Tobago", tw: "Taiwan",
    ug: "Uganda", us: "United States", za: "South Africa",
}

function computeCountries(entries) {
    const codes = new Set(entries.map(e => e.meta?.country).filter(Boolean))
    return Array.from(codes, code => ({ code, name: COUNTRY_NAMES[code] ?? code.toUpperCase() }))
        .sort((a, b) => a.name.localeCompare(b.name))
}

function computeYears(entries) {
    const years = new Set(entries.map(e => e.fields.year).filter(Boolean))
    return Array.from(years).sort((a, b) => b.localeCompare(a))
}

function computeYearCounts(entries) {
    const counts = new Map()
    entries.forEach(e => {
        const year = parseInt(e.fields.year, 10)
        if (!year) return
        counts.set(year, (counts.get(year) || 0) + 1)
    })
    if (counts.size === 0) return []

    const firstYear = Math.min(...counts.keys())
    const currentYear = new Date().getFullYear()
    const result = []
    for (let y = firstYear; y <= currentYear; y++) {
        result.push({ year: y, count: counts.get(y) || 0 })
    }
    return result
}

function computeCountryCounts(entries) {
    const counts = new Map()
    entries.forEach(e => {
        const code = e.meta?.country
        if (!code) return
        counts.set(code, (counts.get(code) || 0) + 1)
    })
    return Array.from(counts, ([code, count]) => ({ code, name: COUNTRY_NAMES[code] ?? code.toUpperCase(), count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const MONTH_NUMBERS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
}

function monthToNumber(month) {
    if (!month) return 0
    const numeric = parseInt(month, 10)
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return numeric
    return MONTH_NUMBERS[month.trim().toLowerCase()] || 0
}

const LIST_SORT_KEYS = ["year", "author", "references", "citedBy"]

function defaultListSortDir(key) {
    return key === "author" ? "asc" : "desc"
}

function firstAuthorSurname(entry) {
    const first = (entry.fields.author || "").split(", ")[0] || ""
    const parts = first.trim().split(" ")
    return parts[parts.length - 1] || ""
}

function authorList(entry) {
    return (entry.fields.author || "").split(", ").map(a => a.trim()).filter(Boolean)
}

function computeCitedByCounts(entries) {
    const counts = {}
    entries.forEach(entry => {
        const refs = Array.isArray(entry.meta?.references) ? entry.meta.references : []
        refs.forEach(refKey => {
            counts[refKey] = (counts[refKey] || 0) + 1
        })
    })
    return counts
}

function computeAuthors(entries) {
    const stats = new Map()
    for (const entry of entries) {
        const names = (entry.fields.author || "").split(", ").map(a => a.trim()).filter(Boolean)
        if (!names.length) continue
        const share = 1 / names.length
        for (const name of names) {
            const rec = stats.get(name) || { count: 0, fractional: 0 }
            rec.count += 1
            rec.fractional += share
            stats.set(name, rec)
        }
    }
    return Array.from(stats, ([name, rec]) => ({ name, count: rec.count, fractional: rec.fractional }))
        .sort((a, b) => b.count - a.count || b.fractional - a.fractional || a.name.localeCompare(b.name))
}

function publications() {
    return {
        entries: [],
        authors: [],
        entryTypes: [],
        countries: [],
        years: [],
        yearCounts: [],
        countryCounts: [],
        aboutStats: null,
        eraStats: null,
        citedByCounts: {},
        yearChart: null,
        countryChart: null,
        searchAuthor: "",
        searchTitle: "",
        searchSource: "",
        authorSearch: "",
        typeFilter: "all",
        countryFilter: "all",
        yearFilter: "all",
        relationFilterType: "",
        relationFilterKey: "",
        loading: true,
        error: null,
        activeTab: "list",
        authorSortKey: "fractional",
        authorSortDir: "desc",
        listSortKey: "year",
        listSortDir: "desc",
        tabs: [
            { id: "list", label: "Article list" },
            { id: "map", label: "Publication map" },
            { id: "authors", label: "Authors" },
            { id: "stats", label: "Statistics" },
            { id: "about", label: "About" },
        ],

        ...window.mapMethods,
        ...window.mapSvgMethods,

        init() {
            this.applyQuery(new URLSearchParams(window.location.search))

            this.$watch("activeTab", () => this.syncQuery())
            this.$watch("searchAuthor", () => this.syncQuery())
            this.$watch("searchTitle", () => this.syncQuery())
            this.$watch("searchSource", () => this.syncQuery())
            this.$watch("authorSearch", () => this.syncQuery())
            this.$watch("typeFilter", () => this.syncQuery())
            this.$watch("countryFilter", () => this.syncQuery())
            this.$watch("yearFilter", () => this.syncQuery())
            this.$watch("relationFilterType", () => this.syncQuery())
            this.$watch("relationFilterKey", () => this.syncQuery())
            this.$watch("listSortKey", () => this.syncQuery())
            this.$watch("listSortDir", () => this.syncQuery())
            this.$watch("activeTab", value => {
                if (value === "map") this.$nextTick(() => this.renderMap())
                if (value === "stats") this.$nextTick(() => this.renderStats())
            })

            window.addEventListener("popstate", () => {
                this.applyQuery(new URLSearchParams(window.location.search))
            })

            this.load()
        },

        applyQuery(params) {
            const tab = params.get("tab")
            this.activeTab = this.tabs.some(t => t.id === tab) ? tab : "list"
            this.searchAuthor = params.get("author") || ""
            this.searchTitle = params.get("title") || ""
            this.searchSource = params.get("source") || ""
            this.authorSearch = params.get("authorSearch") || ""
            this.typeFilter = params.get("type") || "all"
            this.countryFilter = params.get("country") || "all"
            this.yearFilter = params.get("year") || "all"
            const relType = params.get("relType")
            this.relationFilterType = relType === "references" || relType === "citedBy" ? relType : ""
            this.relationFilterKey = this.relationFilterType ? (params.get("relKey") || "") : ""
            const sortKey = params.get("sort")
            this.listSortKey = LIST_SORT_KEYS.includes(sortKey) ? sortKey : "year"
            const sortDir = params.get("dir")
            this.listSortDir = sortDir === "asc" || sortDir === "desc" ? sortDir : defaultListSortDir(this.listSortKey)
        },

        syncQuery() {
            const params = new URLSearchParams()
            if (this.activeTab !== "list") params.set("tab", this.activeTab)
            if (this.searchAuthor) params.set("author", this.searchAuthor)
            if (this.searchTitle) params.set("title", this.searchTitle)
            if (this.searchSource) params.set("source", this.searchSource)
            if (this.authorSearch) params.set("authorSearch", this.authorSearch)
            if (this.typeFilter !== "all") params.set("type", this.typeFilter)
            if (this.countryFilter !== "all") params.set("country", this.countryFilter)
            if (this.yearFilter !== "all") params.set("year", this.yearFilter)
            if (this.relationFilterType && this.relationFilterKey) {
                params.set("relType", this.relationFilterType)
                params.set("relKey", this.relationFilterKey)
            }
            if (this.listSortKey !== "year") params.set("sort", this.listSortKey)
            if (this.listSortDir !== defaultListSortDir(this.listSortKey)) params.set("dir", this.listSortDir)
            const qs = params.toString()
            history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""))
        },

        async load() {
            try {
                const [bibRes, metaRes] = await Promise.all([
                    fetch("data/references.bib"),
                    fetch("data/meta.json"),
                ])
                if (!bibRes.ok) throw new Error("HTTP " + bibRes.status)
                const text = await bibRes.text()
                const meta = metaRes.ok ? await metaRes.json() : {}

                this.entries = bibtexParse.toJSON(text).map(normalizeEntry)
                this.entries.forEach(entry => {
                    entry.meta = meta[entry.key] || {}
                })
                this.authors = computeAuthors(this.entries)
                this.citedByCounts = computeCitedByCounts(this.entries)
                this.entryTypes = [...new Set(this.entries.map(e => e.type))].sort()
                this.countries = computeCountries(this.entries)
                this.years = computeYears(this.entries)
                this.mapNodes = computeMapNodes(this.entries, e => this.sourceName(e))
                this.yearCounts = computeYearCounts(this.entries)
                this.countryCounts = computeCountryCounts(this.entries)
                this.aboutStats = computeAboutStats(this.entries)
                this.eraStats = computeEraStats(this.entries)
            } catch (e) {
                this.error = e.message
            } finally {
                this.loading = false
                if (this.activeTab === "map") this.$nextTick(() => this.renderMap())
                if (this.activeTab === "stats") this.$nextTick(() => this.renderStats())
            }
        },

        setAuthorSort(key) {
            if (this.authorSortKey === key) {
                this.authorSortDir = this.authorSortDir === "asc" ? "desc" : "asc"
            } else {
                this.authorSortKey = key
                this.authorSortDir = key === "name" ? "asc" : "desc"
            }
        },

        authorSortIcon(key) {
            if (this.authorSortKey !== key) return "ti-selector text-slate-300"
            return this.authorSortDir === "asc" ? "ti-chevron-up" : "ti-chevron-down"
        },

        sortedAuthors() {
            const dir = this.authorSortDir === "asc" ? 1 : -1
            const key = this.authorSortKey
            return [...this.authors].sort((a, b) => {
                if (key === "name") return dir * a.name.localeCompare(b.name)
                return dir * (a[key] - b[key]) || a.name.localeCompare(b.name)
            })
        },

        visibleAuthors() {
            const q = foldText(this.authorSearch.trim())
            const sorted = this.sortedAuthors()
            return q ? sorted.filter(a => foldText(a.name).includes(q)) : sorted
        },

        goToAuthor(name) {
            this.searchAuthor = name
            this.searchTitle = ""
            this.searchSource = ""
            this.typeFilter = "all"
            this.countryFilter = "all"
            this.yearFilter = "all"
            this.activeTab = "list"
        },

        clearListFilters() {
            this.searchAuthor = ""
            this.searchTitle = ""
            this.searchSource = ""
            this.typeFilter = "all"
            this.countryFilter = "all"
            this.yearFilter = "all"
            this.relationFilterType = ""
            this.relationFilterKey = ""
            this.listSortKey = "year"
            this.listSortDir = "desc"
        },

        hasActiveListFiltersOrSort() {
            return Boolean(
                this.searchAuthor || this.searchTitle || this.searchSource ||
                this.typeFilter !== "all" || this.countryFilter !== "all" || this.yearFilter !== "all" ||
                this.relationFilterKey ||
                this.listSortKey !== "year" || this.listSortDir !== "desc"
            )
        },

        filteredEntries() {
            const author = foldText(this.searchAuthor.trim())
            const title = foldText(this.searchTitle.trim())
            const source = foldText(this.searchSource.trim())

            const relEntry = this.relationFilterKey
                ? this.entries.find(e => e.key === this.relationFilterKey)
                : null
            const relRefs = relEntry && this.relationFilterType === "references"
                ? (Array.isArray(relEntry.meta?.references) ? relEntry.meta.references : [])
                : null

            return this.entries.filter(entry => {
                if (this.typeFilter !== "all" && entry.type !== this.typeFilter) return false
                if (this.countryFilter !== "all" && entry.meta.country !== this.countryFilter) return false
                if (this.yearFilter !== "all" && entry.fields.year !== this.yearFilter) return false
                if (author && !foldText(entry.fields.author).includes(author)) return false
                if (title && !foldText(entry.fields.title).includes(title)) return false
                if (source && !foldText(this.sourceName(entry)).includes(source)) return false
                if (relRefs && !relRefs.includes(entry.key)) return false
                if (this.relationFilterType === "citedBy" && this.relationFilterKey) {
                    const refs = Array.isArray(entry.meta?.references) ? entry.meta.references : []
                    if (!refs.includes(this.relationFilterKey)) return false
                }
                return true
            })
        },

        authorList(entry) {
            return authorList(entry)
        },

        filterByAuthor(name) {
            this.searchAuthor = name
        },

        filterByCountry(code) {
            if (!code) return
            this.countryFilter = code
        },

        filterByYear(year) {
            if (!year) return
            this.yearFilter = year
        },

        filterByReferences(entry) {
            if (this.relationFilterType === "references" && this.relationFilterKey === entry.key) {
                this.clearRelationFilter()
                return
            }
            this.relationFilterType = "references"
            this.relationFilterKey = entry.key
        },

        filterByCitedBy(entry) {
            if (this.relationFilterType === "citedBy" && this.relationFilterKey === entry.key) {
                this.clearRelationFilter()
                return
            }
            this.relationFilterType = "citedBy"
            this.relationFilterKey = entry.key
        },

        clearRelationFilter() {
            this.relationFilterType = ""
            this.relationFilterKey = ""
        },

        relationFilterSourceEntry() {
            return this.relationFilterKey ? this.entries.find(e => e.key === this.relationFilterKey) : null
        },

        relationFilterLabel() {
            const source = this.relationFilterSourceEntry()
            const title = source?.fields?.title || this.relationFilterKey
            return this.relationFilterType === "references"
                ? `Showing publications referenced by "${title}"`
                : `Showing publications that cite "${title}"`
        },

        setListSort(key) {
            if (this.listSortKey === key) {
                this.listSortDir = this.listSortDir === "asc" ? "desc" : "asc"
            } else {
                this.listSortKey = key
                this.listSortDir = defaultListSortDir(key)
            }
        },

        listSortIcon(key) {
            if (this.listSortKey !== key) return "ti-selector text-slate-300"
            return this.listSortDir === "asc" ? "ti-chevron-up" : "ti-chevron-down"
        },

        listSortValue(entry) {
            switch (this.listSortKey) {
                case "author":
                    return foldText(firstAuthorSurname(entry))
                case "references":
                    return this.referencesCount(entry)
                case "citedBy":
                    return this.citedByCount(entry)
                case "year":
                default: {
                    const year = parseInt(entry.fields.year, 10)
                    if (!Number.isFinite(year)) return -Infinity
                    return year * 100 + monthToNumber(entry.fields.month)
                }
            }
        },

        sortedEntries(list) {
            const dir = this.listSortDir === "asc" ? 1 : -1
            return [...list].sort((a, b) => {
                const av = this.listSortValue(a)
                const bv = this.listSortValue(b)
                if (av < bv) return -dir
                if (av > bv) return dir
                const authorCmp = foldText(firstAuthorSurname(a)).localeCompare(foldText(firstAuthorSurname(b)))
                if (authorCmp !== 0) return authorCmp
                return foldText(a.fields.title).localeCompare(foldText(b.fields.title))
            })
        },

        visibleEntries() {
            return this.sortedEntries(this.filteredEntries())
        },

        sourceIcon(entry) {
            if (entry.fields.journal) return "ti-notebook"
            if (entry.fields.booktitle) return "ti-book"
            if (entry.fields.publisher) {
                return entry.type === "misc" ? "ti-database" : "ti-building"
            }
            return "ti-file-text"
        },

        referencesCount(entry) {
            return Array.isArray(entry.meta?.references) ? entry.meta.references.length : 0
        },

        citedByCount(entry) {
            return this.citedByCounts[entry.key] || 0
        },

        sourceName(entry) {
            const f = entry.fields
            return f.journal || f.booktitle || f.publisher || "—"
        },

        citationMeta(entry) {
            const f = entry.fields
            const parts = []
            if (f.volume) {
                parts.push(f.number ? `${f.volume}(${f.number})` : `vol. ${f.volume}`)
            } else if (f.number) {
                parts.push(`no. ${f.number}`)
            }
            if (f.pages) parts.push(`pp. ${f.pages}`)
            return parts.join(", ")
        },

        extraDetails(entry) {
            const f = entry.fields
            const parts = []
            if (f.editor) parts.push(`Ed. ${f.editor}`)
            if (f.series) parts.push(f.series)
            if (f.booktitle && f.publisher) {
                parts.push(f.address ? `${f.publisher}, ${f.address}` : f.publisher)
            }
            if (f.isbn) parts.push(`ISBN ${f.isbn}`)
            return parts.join(" · ")
        },

        renderStats() {
            if (this.yearChart) {
                this.yearChart.resize()
            } else {
                this.renderYearChart()
            }

            if (this.countryChart) {
                this.countryChart.resize()
            } else {
                this.renderCountryChart()
            }
        },

        renderYearChart() {
            const yearCanvas = document.getElementById("yearChart")
            if (yearCanvas && this.yearCounts.length) {
                this.yearChart = new Chart(yearCanvas.getContext("2d"), {
                    type: "bar",
                    data: {
                        labels: this.yearCounts.map(d => d.year),
                        datasets: [{
                            data: this.yearCounts.map(d => d.count),
                            backgroundColor: "rgba(217,119,6,0.6)",
                            borderColor: "rgba(217,119,6,1)",
                            borderWidth: 1,
                            borderRadius: 3,
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { title: { display: true, text: "Year" } },
                            y: {
                                title: { display: true, text: "Publications" },
                                beginAtZero: true,
                                ticks: { precision: 0 },
                            },
                        },
                    },
                })
            }
        },

        renderCountryChart() {
            const countryCanvas = document.getElementById("countryChart")
            if (countryCanvas && this.countryCounts.length) {
                this.countryChart = new Chart(countryCanvas.getContext("2d"), {
                    type: "bar",
                    data: {
                        labels: this.countryCounts.map(d => d.name),
                        datasets: [{
                            data: this.countryCounts.map(d => d.count),
                            backgroundColor: "rgba(37,99,235,0.6)",
                            borderColor: "rgba(37,99,235,1)",
                            borderWidth: 1,
                            borderRadius: 3,
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: {
                                title: { display: true, text: "Country" },
                                ticks: { autoSkip: false, maxRotation: 60 },
                            },
                            y: {
                                title: { display: true, text: "Publications" },
                                beginAtZero: true,
                                ticks: { precision: 0 },
                            },
                        },
                    },
                })
            }
        },
    }
}
