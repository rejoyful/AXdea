"use client";
import { useEffect } from "react";

// 기존 바닐라 앱의 마크업을 그대로 렌더하고, 마운트 후 /js/app.js(모듈)를 로드해 앱을 구동한다.
const MARKUP = `
  <header class="topbar">
    <div class="brand">
      <span class="logo">AX<span class="logo-accent">dea</span></span>
    </div>
    <div class="actions">
      <div class="actions-group">
        <button class="navbtn" id="archive-btn" title="지난 라운드 아카이브" aria-label="아카이브" hidden><span class="nb-ico"></span><span class="nb-label">아카이브</span></button>
        <button class="navbtn" id="split-btn" title="라운드 분할 비교" aria-label="분할 비교"><span class="nb-ico"></span><span class="nb-label">분할</span></button>
        <button class="navbtn" id="list-btn" title="전체 아이디어 목록" aria-label="목록"><span class="nb-ico"></span><span class="nb-label">목록</span></button>
      </div>
      <div class="actions-side">
        <button class="navbtn" id="theme-btn" title="테마 전환" aria-label="테마"><span class="nb-ico"></span><span class="nb-label">테마</span></button>
        <span class="me" id="me-chip" title="이름 변경"></span>
      </div>
    </div>
  </header>

  <div class="marquee" id="marquee" hidden>
    <div class="mq-board" id="mq-board" title="아카이브 열기">
      <span class="mq-status"><i class="mq-dot"></i><b id="mq-label">LIVE</b></span>
      <div class="mq-screen"><div class="mq-track" id="mq-track"></div></div>
    </div>
    <button class="mq-return" id="mq-return" hidden>← 현재 라운드로</button>
  </div>

  <main class="stage" id="stage">
    <div class="panels" id="panels"></div>
    <p class="empty-hint" id="empty-hint">아직 아이디어가 없어요. 오른쪽 아래 <b>+</b> 로 첫 아이디어를 띄워보세요.</p>
    <div class="cat" id="cat" aria-hidden="true">
      <div class="cat-inner">
        <svg class="cat-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <!-- 꼬리 (살랑살랑) -->
          <path class="cat-tail" d="M45 52 C60 50 60 32 51 31" fill="none" stroke="#e8934a" stroke-width="7" stroke-linecap="round"/>
          <!-- 앉은 몸통 -->
          <path d="M18 56 C15 40 22 29 32 29 C42 29 49 40 46 56 Z" fill="#f2a65a"/>
          <path d="M32 34 C26 34 22 42 23 56 L41 56 C42 42 38 34 32 34 Z" fill="#f7b36c"/>
          <!-- 앞발 -->
          <ellipse cx="26" cy="54" rx="5" ry="6.5" fill="#f7b36c"/>
          <ellipse cx="38" cy="54" rx="5" ry="6.5" fill="#f7b36c"/>
          <path d="M23.5 55 L28.5 55 M33.5 55 L38.5 55" stroke="#e8934a" stroke-width="0.9" stroke-linecap="round"/>
          <!-- 머리 -->
          <g class="cat-head">
            <path d="M21 15 L18 3 L31 12 Z" fill="#f2a65a"/>
            <path d="M43 15 L46 3 L33 12 Z" fill="#f2a65a"/>
            <path d="M23 13 L22 6 L30 12 Z" fill="#ffc9c9"/>
            <path d="M41 13 L42 6 L34 12 Z" fill="#ffc9c9"/>
            <circle cx="32" cy="22" r="15" fill="#f7b36c"/>
            <circle cx="24.5" cy="26" r="3.2" fill="#ffb3b3" opacity="0.55"/>
            <circle cx="39.5" cy="26" r="3.2" fill="#ffb3b3" opacity="0.55"/>
            <g class="cat-eyes">
              <ellipse cx="26.5" cy="21" rx="2.7" ry="3.8" fill="#2b2b2b"/>
              <ellipse cx="37.5" cy="21" rx="2.7" ry="3.8" fill="#2b2b2b"/>
              <circle cx="27.6" cy="19.5" r="1" fill="#fff"/>
              <circle cx="38.6" cy="19.5" r="1" fill="#fff"/>
            </g>
            <path d="M30 25 L34 25 L32 27.4 Z" fill="#e26d6d"/>
            <path d="M32 27.4 C32 29 30.4 29.6 29 29" fill="none" stroke="#d9825a" stroke-width="0.9" stroke-linecap="round"/>
            <path d="M32 27.4 C32 29 33.6 29.6 35 29" fill="none" stroke="#d9825a" stroke-width="0.9" stroke-linecap="round"/>
            <g stroke="#d9a06b" stroke-width="1" stroke-linecap="round">
              <line x1="24" y1="25" x2="15" y2="24"/>
              <line x1="24" y1="27" x2="15" y2="29"/>
              <line x1="40" y1="25" x2="49" y2="24"/>
              <line x1="40" y1="27" x2="49" y2="29"/>
            </g>
          </g>
        </svg>
      </div>
    </div>
  </main>

  <button class="fab" id="fab" title="아이디어 추가" aria-label="아이디어 추가"></button>

  <div class="modal-scrim" id="name-modal" hidden>
    <div class="modal name-card">
      <h2>어서오세요 👋</h2>
      <p class="sub">이 놀이터에 들어갈 이름을 알려주세요.<br/>작성자는 기본적으로 <b>가려집니다.</b></p>
      <input type="text" id="name-input" placeholder="이름 (예: 홍길동)" maxlength="20" autocomplete="off"/>
      <button class="btn primary" id="name-save">입장하기</button>
      <p class="fineprint">이름은 이 브라우저에만 저장돼요.</p>
    </div>
  </div>

  <div class="modal-scrim" id="card-modal" hidden>
    <div class="modal idea-card" id="idea-card">
      <div class="card-head" id="card-head"></div>
      <div class="card-body" id="card-body"></div>
      <div class="card-social" id="card-social"></div>
      <div class="card-comments" id="card-comments"></div>
      <form class="comment-form" id="comment-form">
        <div class="sent-pick" id="comment-sent"></div>
        <div class="comment-row">
          <textarea id="comment-input" placeholder="첫 댓글을 남겨보세요" maxlength="300" rows="2" autocomplete="off"></textarea>
          <button class="btn primary" type="submit">등록</button>
        </div>
      </form>
      <div class="card-footer" id="card-footer"></div>
      <button class="modal-close" id="card-close" aria-label="닫기">✕</button>
    </div>
  </div>

  <div class="modal-scrim" id="compose-modal" hidden>
    <div class="modal compose-card">
      <h2 id="compose-title">새 아이디어 띄우기</h2>
      <input type="text" id="c-title" placeholder="한 줄 제목" maxlength="60" autocomplete="off"/>
      <textarea id="c-body" placeholder="무엇을 해보고 싶나요? 어떤 불편을 풀고 싶나요?" maxlength="1000" rows="6"></textarea>
      <label class="field-label">카테고리</label>
      <div class="chip-picker" id="c-category"></div>
      <label class="field-label">색상</label>
      <div class="color-picker" id="c-color"></div>
      <div class="compose-actions">
        <button class="btn" id="c-cancel">취소</button>
        <button class="btn primary" id="c-save">띄우기 🎈</button>
      </div>
    </div>
  </div>

  <div class="modal-scrim" id="list-modal" hidden>
    <div class="modal list-card">
      <h2>전체 아이디어 <span class="list-count" id="list-count"></span></h2>
      <div class="list-sort" id="list-sort"></div>
      <div class="list-items" id="list-items"></div>
      <button class="modal-close" id="list-close" aria-label="닫기">✕</button>
    </div>
  </div>

  <div class="modal-scrim" id="promote-modal" hidden>
    <div class="modal promote-card">
      <h2>선정 · 라운드로 복제</h2>
      <p class="sub">이 아이디어를 <b>다른 라운드로 복제</b>합니다. 원본은 그대로 남고, 복제본은 반응(좋아요·커피·댓글·해보자·아쉬워)이 <b>초기화</b>되어 실행 피드백을 새로 받습니다.</p>
      <div class="promote-idea" id="promote-idea"></div>
      <label class="field-label">대상 라운드 선택</label>
      <div class="round-picker" id="promote-rounds"></div>
      <label class="field-label">또는 새 라운드 만들기</label>
      <input type="text" id="promote-new" placeholder="새 라운드 이름 (예: 카운잡 실행)" maxlength="255" autocomplete="off" />
      <div class="compose-actions">
        <button class="btn" id="promote-cancel">취소</button>
        <button class="btn primary" id="promote-apply">복제하기</button>
      </div>
      <button class="modal-close" id="promote-close" aria-label="닫기"></button>
    </div>
  </div>

  <div class="modal-scrim" id="archive-modal" hidden>
    <div class="modal archive-card">
      <h2>아카이브 <span class="list-count" id="archive-count"></span></h2>
      <p class="sub">라운드별로 아이디어를 모아 보관합니다. 지난 라운드는 <b>읽기 전용</b>으로 언제든 열람할 수 있어요.</p>
      <div class="list-items" id="archive-items"></div>
      <div class="archive-actions" id="archive-actions"></div>
      <button class="modal-close" id="archive-close" aria-label="닫기">✕</button>
    </div>
  </div>

  <div class="modal-scrim" id="split-modal" hidden>
    <div class="modal split-card">
      <h2>라운드 분할 비교</h2>
      <p class="sub">비교할 <b>라운드(주제)</b>를 <b>2~4개</b> 고르면 화면을 나눠 각 라운드의 아이디어를 나란히 보여줍니다. (읽기 전용 · 데스크톱·태블릿 전용, 모바일은 통합 표시)</p>
      <div class="chip-picker" id="split-cats"></div>
      <p class="fineprint" id="split-hint"></p>
      <div class="compose-actions">
        <button class="btn" id="split-off" hidden>단일 보기로</button>
        <button class="btn primary" id="split-apply">분할 비교</button>
      </div>
      <button class="modal-close" id="split-close" aria-label="닫기">✕</button>
    </div>
  </div>
`;

export default function Page() {
  useEffect(() => {
    if (document.getElementById("__axdea_app")) return;
    const s = document.createElement("script");
    s.type = "module";
    s.src = "/js/app.js";
    s.id = "__axdea_app";
    document.body.appendChild(s);
  }, []);
  return <div id="axdea-root" dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
