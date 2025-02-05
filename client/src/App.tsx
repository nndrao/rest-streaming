import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  StrictMode,
} from "react";

import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ColDef,
  ColGroupDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ModuleRegistry,
  Theme,
  createGrid,
  themeQuartz,
} from "ag-grid-community";
import { ColumnsToolPanelModule, FiltersToolPanelModule } from "ag-grid-enterprise";

// Register both community and enterprise tool panels to enable the sidebar in AG Grid
ModuleRegistry.registerModules([AllCommunityModule, ColumnsToolPanelModule, FiltersToolPanelModule]);

// Import the required CSS files for AG Grid
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "ag-grid-enterprise/styles/ag-grid.css";
import "ag-grid-enterprise/styles/ag-theme-quartz.css";

function App() {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    boxSizing: "border-box",
  };
  
  const headerStyle: React.CSSProperties = {
    padding: "10px",
    backgroundColor: "#f9f9f9",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
  };
  
  const gridContainerStyle: React.CSSProperties = {
    flex: 1,
    padding: "0 20px",
    overflow: "auto",
  };
  
  const footerStyle: React.CSSProperties = {
    padding: "15px 20px",
    backgroundColor: "#fff",
    borderTop: "2px solid #e5e5e5",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    fontSize: "14px",
    color: "#333",
    boxShadow: "0 -2px 6px rgba(0, 0, 0, 0.1)",
    flexShrink: 0,
  };

  const [rowData, setRowData] = useState<any[]>([]);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>([]);
  const [endpoint, setEndpoint] = useState<string>("http://localhost:3000/stream-json/sa.json");
  const [stats, setStats] = useState<{
    chunkCount: number;
    fetchTime: number;
    renderTime: number;
    totalTime: number;
  }>({ chunkCount: 0, fetchTime: 0, renderTime: 0, totalTime: 0 });

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  const gridApiRef = useRef<GridApi | null>(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) return;

    gridApiRef.current?.closeToolPanel();

    setRowData([]);
    setColumnDefs([]);
    setStats({ chunkCount: 0, fetchTime: 0, renderTime: 0, totalTime: 0 });

    let localChunkCount = 0;
    const fetchStart = performance.now();
    let accumulatedData: any[] = [];

    try {
      const response = await fetch(endpoint);
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n");
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);

          if (chunk) {
            localChunkCount++;
            try {
              const data = JSON.parse(chunk);
              if (!columnDefs.length && Array.isArray(data) && data.length > 0) {
                const cols = Object.keys(data[0]).map((key) => ({ field: key }));
                setColumnDefs(cols);
              }
              accumulatedData = [...accumulatedData, ...data];
              setRowData((prevData) => [...prevData, ...data]);
            } catch (error) {
              console.error("JSON parse error:", error);
            }
          }
          boundary = buffer.indexOf("\n");
        }
      }

      if (buffer.trim()) {
        localChunkCount++;
        try {
          const data = JSON.parse(buffer);
          if (!columnDefs.length && Array.isArray(data) && data.length > 0) {
            const cols = Object.keys(data[0]).map((key) => ({ field: key }));
            setColumnDefs(cols);
          }
          accumulatedData = [...accumulatedData, ...data];
          setRowData((prevData) => [...prevData, ...data]);
        } catch (error) {
          console.error("Final JSON parse error:", error);
        }
      }

      setRowData(accumulatedData);
    } catch (error) {
      console.error("Error fetching data:", error);
    }

    const fetchEnd = performance.now();
    const fetchTime = fetchEnd - fetchStart;
    setTimeout(() => {
      const renderTime = performance.now() - fetchEnd;
      setStats({
        chunkCount: localChunkCount,
        fetchTime,
        renderTime,
        totalTime: fetchTime + renderTime,
      });
    }, 0);
  }, [endpoint]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="Enter REST endpoint"
          style={{
            padding: "8px",
            fontSize: "16px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            width: "100%",
            maxWidth: "400px",
            marginRight: "10px",
          }}
        />
        <button
          onClick={fetchData}
          style={{
            padding: "8px 12px",
            fontSize: "16px",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#007BFF",
            color: "white",
            cursor: "pointer",
          }}
        >
          Fetch Data
        </button>
      </div>

      <div style={gridContainerStyle}>
        <div style={{ height: "100%" }} className="ag-theme-quartz">
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            theme="themeQuartz"
            sideBar={{
              toolPanels: [
                {
                  id: "columns",
                  labelDefault: "Columns",
                  labelKey: "columns",
                  iconKey: "columns",
                  toolPanel: "agColumnsToolPanel",
                },
                {
                  id: "filters",
                  labelDefault: "Filters",
                  labelKey: "filters",
                  iconKey: "filter",
                  toolPanel: "agFiltersToolPanel",
                },
              ],
            }}
            defaultColDef={defaultColDef}
            onGridReady={(params) => {
              gridApiRef.current = params.api;
            }}
          />
        </div>
      </div>

      <div style={footerStyle}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <strong>Total Rows:</strong> {rowData.length}
        </div>
        <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #e5e5e5" }}>
          <strong>Chunks:</strong> {stats.chunkCount}
        </div>
        <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #e5e5e5" }}>
          <strong>Fetch:</strong> {stats.fetchTime.toFixed(2)} ms
        </div>
        <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #e5e5e5" }}>
          <strong>Render:</strong> {stats.renderTime.toFixed(2)} ms
        </div>
        <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #e5e5e5" }}>
          <strong>Total:</strong> {stats.totalTime.toFixed(2)} ms
        </div>
      </div>
    </div>
  );
}

export default App;
