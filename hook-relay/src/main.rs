use std::io::Read;

fn collect() -> Option<()> {
    let timestamp = glim_core::now_ms();
    let provider = std::env::args().nth(1)?;
    let mut input = Vec::new();
    std::io::stdin().take((glim_core::MAX_PAYLOAD + 1) as u64).read_to_end(&mut input).ok()?;
    if input.len() > glim_core::MAX_PAYLOAD { return None; }
    let payload = serde_json::from_slice(&input).ok()?;
    let mut event = glim_core::normalize(&provider, &payload, timestamp)?;
    glim_core::attach_ancestry(&mut event);
    glim_core::persist(&glim_core::data_dir().ok()?.join("observations"), &event).ok()
}

fn main() {
    // Hard deadline and silent exit: monitoring can never hold up the agent or emit context.
    std::panic::set_hook(Box::new(|_| {}));
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || { let _ = collect(); let _ = tx.send(()); });
    let _ = rx.recv_timeout(std::time::Duration::from_millis(700));
}
