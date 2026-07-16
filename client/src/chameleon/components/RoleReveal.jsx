import { FullPage, TopicGrid, CBtn, C } from "../ChameleonApp.jsx";

export default function RoleReveal({ room, myPlayer, privateInfo, socket }) {
  const { isChameleon, secretCoord, rowHint } = privateInfo;
  const { gridRows } = room;

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5" style={{ paddingTop: 16, paddingBottom: 16 }}>
        {/* Role badge */}
        <div style={{ textAlign: "center" }}>
          {isChameleon ? (
            <>
              <div style={{ color: C.amber, fontSize: "10px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 6 }}>
                YOU ARE THE
              </div>
              <div style={{ color: C.amber, fontSize: "32px", fontWeight: 900, letterSpacing: "0.15em" }}>
                CHAMELEON
              </div>
              <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginTop: 6 }}>
                BLEND IN. DON'T GET CAUGHT.
              </div>
              {rowHint && (
                <div style={{ marginTop: 10, padding: "8px 12px", border: `1px solid ${C.amber}`, background: "rgba(212,160,23,0.08)" }}>
                  <div style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.2em", marginBottom: 3 }}>HINT</div>
                  <div style={{ color: C.amber, fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em" }}>{rowHint.toUpperCase()}</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ color: C.olive, fontSize: "10px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 6 }}>
                YOU ARE CREW
              </div>
              <div style={{ color: C.olive, fontSize: "32px", fontWeight: 900, letterSpacing: "0.15em" }}>
                {secretCoord}
              </div>
              <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", marginTop: 6 }}>
                IS YOUR SECRET WORD
              </div>
              {rowHint && (
                <div style={{ marginTop: 10, padding: "8px 12px", border: `1px solid ${C.olive}`, background: "rgba(143,175,90,0.08)" }}>
                  <div style={{ color: C.dim, fontSize: "8px", letterSpacing: "0.2em", marginBottom: 3 }}>HINT VISIBLE TO CHAMELEON</div>
                  <div style={{ color: C.olive, fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em" }}>{rowHint.toUpperCase()}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Grid */}
        <TopicGrid rows={gridRows} highlightCoord={isChameleon ? null : secretCoord} />

        {!isChameleon && (
          <div style={{ textAlign: "center", color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em" }}>
            MEMORIZE YOUR COORDINATE. THE GRID STAYS VISIBLE.
          </div>
        )}

        <CBtn onClick={() => socket.emit("CHAMELEON_PLAYER_READY")}>READY</CBtn>

        {/* Waiting indicator */}
        <div style={{ textAlign: "center", color: C.faint, fontSize: "9px", letterSpacing: "0.15em" }}>
          WAITING FOR ALL PLAYERS TO CONFIRM...
        </div>
      </div>
    </FullPage>
  );
}
