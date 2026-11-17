import SwiftUI

struct AlertsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showEditor = false

    var body: some View {
        List {
            Section {
                ForEach(store.alerts) { a in
                    HStack(spacing: 10) {
                        Image(systemName: "bell.fill")
                            .foregroundStyle(a.enabled ? Theme.accent : Theme.textDim)
                            .frame(width: 32, height: 32)
                            .background((a.enabled ? Theme.accent : Theme.textDim).opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(a.name).font(.system(size: 13.5, weight: .medium))
                                Text(a.direction.label + " " + a.price.fmt())
                                    .font(.system(size: 10, weight: .medium))
                                    .padding(.horizontal, 5).padding(.vertical, 2)
                                    .background(a.direction.color.opacity(0.1))
                                    .foregroundStyle(a.direction.color)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                            }
                            Text(a.note.isEmpty ? (a.triggeredAt.map { "触发于 \($0)" } ?? "交易时段每 45 秒检查") : a.note)
                                .font(.system(size: 10.5)).foregroundStyle(Theme.textDim)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(
                            get: { a.enabled },
                            set: { _ in store.toggleAlert(a) }
                        )).labelsHidden()
                    }
                    .padding(.vertical, 3)
                }
                .onDelete { idx in
                    for i in idx { store.deleteAlert(store.alerts[i]) }
                }
            } header: {
                Text("监控中的提醒")
            } footer: {
                Text("触发一次后自动关闭 · 仅在 App 处于前台时检查")
            }

            if !store.signals.isEmpty {
                Section("信号记录") {
                    ForEach(store.signals.prefix(20)) { s in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(s.message).font(.system(size: 12))
                            Text(s.createdAt).font(.system(size: 10)).foregroundStyle(Theme.textDim)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle("价格提醒")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showEditor = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showEditor) {
            AlertEditorView(code: "", name: "", currentPrice: 0)
        }
        .overlay {
            if store.alerts.isEmpty {
                ContentUnavailableView("还没有价格提醒", systemImage: "bell.slash",
                                       description: Text("点右上角 + 创建"))
            }
        }
    }
}

struct AlertEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    var code = ""
    var name = ""
    var currentPrice: Double = 0
    @State private var inputCode = ""
    @State private var inputName = ""
    @State private var direction: AlertDirection = .above
    @State private var price = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("标的") {
                    TextField("6 位代码", text: $inputCode)
                        .keyboardType(.numberPad)
                        .onChange(of: inputCode) { _, v in
                            inputCode = String(v.filter(\.isNumber).prefix(6))
                            if inputCode.count == 6 {
                                Task {
                                    if let q = try? await MarketService.shared.quote(inputCode) {
                                        inputName = q.name
                                        if price.isEmpty { price = String(format: "%.2f", q.price ?? 0) }
                                    }
                                }
                            }
                        }
                    TextField("名称", text: $inputName)
                }
                Section("条件") {
                    Picker("方向", selection: $direction) {
                        ForEach(AlertDirection.allCases, id: \.self) { d in Text(d.label).tag(d) }
                    }
                    .pickerStyle(.segmented)
                    TextField("触发价", text: $price).keyboardType(.decimalPad)
                    TextField("备注", text: $note)
                }
            }
            .navigationTitle("新建提醒")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("创建") {
                        guard inputCode.count == 6, let p = Double(price), p > 0 else { return }
                        store.addAlert(PriceAlert(code: inputCode, name: inputName.isEmpty ? inputCode : inputName,
                                                  direction: direction, price: p, note: note))
                        dismiss()
                    }
                    .disabled(inputCode.count != 6 || Double(price) == nil)
                }
            }
            .onAppear {
                inputCode = code
                inputName = name
                if currentPrice > 0 { price = String(format: "%.2f", currentPrice) }
            }
        }
    }
}
