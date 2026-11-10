# FAQ

### Does this affect my current StockDesk app?

No. `stockdesk-akshare` is a separate folder and source snapshot. It does not replace the running app, its database, or its ports.

### Why is the Windows app a native window, not a browser tab?

The exe uses pywebview with Edge WebView2. If WebView2 is unavailable (Windows 7/8), it falls back to the default browser.

### Why do I see a browser on macOS?

The app normally uses a pywebview/WebKit window. If the native runtime cannot start, it falls back to the browser. Check the log in `~/Library/Application Support/StockDesk/stockdesk.log`.

### Does scaling change the map or charts?

No. Desktop scaling changes text sizes only; layout reflows and rows grow. Maps and fixed graphics keep their geometry.

### Why is the largest percolation cluster used?

Up-count measures breadth only. The largest 4-neighbour cluster (giant component) measures whether gains are connected. A large cluster means diffusion; a small cluster means isolated strength. The 0.592746 threshold is the 2-D square-site critical value.

### Is this investment advice?

No. Data may be delayed or wrong; use at your own risk.
