// ===== Supabase 연동 유틸 =====
async function getEntityIdByName(table, name) {
  const { data, error } = await supabaseClient
    .from(table)
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (error) { alert(error.message); return null; }
  return data ? data.id : null;
}

async function submitRating(table, restaurantId, score) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { alert('로그인이 필요합니다. 상단의 "구글로 로그인" 버튼을 눌러주세요.'); return false; }
  if (!Number.isInteger(score) || score < 1 || score > 5) { alert('평점은 1~5로 입력해주세요.'); return false; }

  const { error } = await supabaseClient
    .from('ratings')
    .insert({ restaurant_id: restaurantId, user_id: user.id, score });
  if (error) { alert(error.message); return false; }
  return true;
}

async function submitComment(table, restaurantId, content) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { alert('로그인이 필요합니다. 상단의 "구글로 로그인" 버튼을 눌러주세요.'); return false; }
  const text = (content || '').trim();
  if (!text) return false;

  const { error } = await supabaseClient
    .from('comments')
    .insert({ restaurant_id: restaurantId, user_id: user.id, content: text });
  if (error) { alert(error.message); return false; }
  return true;
}

async function loadRecent(restaurantId, containerId) {
  // 평균 평점
  const { data: scores, error: e1 } = await supabaseClient
    .from('ratings')
    .select('score')
    .eq('restaurant_id', restaurantId);
  if (e1) { console.warn(e1); }

  const avg = (scores && scores.length)
    ? (scores.reduce((a, b) => a + b.score, 0) / scores.length).toFixed(1)
    : '-';

  // 최근 코멘트 5개
  const { data: cmts, error: e2 } = await supabaseClient
    .from('comments')
    .select('content, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (e2) { console.warn(e2); }

  const commentsHtml = (cmts || []).map(c => `• ${c.content}`).join('<br>');
  const target = document.getElementById(containerId);
  if (target) {
    target.innerHTML = `평균 평점: ${avg} (${scores?.length || 0}명)<br>${commentsHtml || ''}`;
  }
}
// ===== Supabase 연동 유틸 끝 =====

let restaurants = [];
let restaurantQueue = [];
let clickCount = 0;
let clickTimer = null;

// JSON 불러오기
fetch('restaurants.json')
  .then(response => response.json())
  .then(data => {
    restaurants = data;
    shuffleQueue(); // 처음 로딩 시 셔플 큐 생성

    // 식당 수 표시
    const countElement = document.getElementById("restaurant-count");
    if (countElement) {
      countElement.innerText = `현재 총 ${restaurants.length}개의 식당이 준비되어 있습니다.`;
    }
  });

// Fisher-Yates 셔플로 queue 생성
function shuffleQueue() {
  restaurantQueue = [...restaurants];

  for (let i = restaurantQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [restaurantQueue[i], restaurantQueue[j]] = [restaurantQueue[j], restaurantQueue[i]];
  }
}

// 연타 방지 로직
function handleRapidClick() {
  clickCount++;

  if (clickTimer === null) {
    clickTimer = setTimeout(() => {
      clickCount = 0;
      clickTimer = null;
    }, 3000);
  }

  if (clickCount >= 10) {
    alert("좀 읽고 누르시고 계신건지 궁금합니다");
    clickCount = 0;
    clearTimeout(clickTimer);
    clickTimer = null;
    return true;
  }

  return false;
}

function pickLunch() {
  if (handleRapidClick()) return;

  const disclaimer = document.getElementById("disclaimer");
  if (disclaimer) {
    disclaimer.style.display = "none";
  }
  const countElement = document.getElementById("restaurant-count");
  if (countElement) {
    countElement.style.display = "none";
  }
  
  if (restaurantQueue.length === 0) {
    alert(
      `지금까지 총 ${restaurants.length}개의 식당을 모두 보셨습니다!\n\n` +
      `아직 고르지 못하셨다면 앞으로 더 발전하는 머신이 되겠습니다!\n` +
      `aSSIST 주변 맛있는 식당 제보는 wschoi@assist.ac.kr로 연락 부탁드립니다~`
    );


    shuffleQueue(); // 한 바퀴 다 돌았으면 새로 섞음
  }

  const picked = restaurantQueue.shift(); // 큐에서 하나 꺼냄

  const formattedComment = picked.comment.replace(/\n/g, "<br>");
  const linkHTML = picked.link ? `<br><a href="${picked.link}" target="_blank">📍 지도 보기</a>` : "";

  document.getElementById("result").innerHTML = `
    <strong>${picked.name}</strong><br>
    <em>${formattedComment}</em>
    ${linkHTML}
    <div style="margin-top:12px">
      <label>평점(1~5): <input id="rating-input" type="number" min="1" max="5" style="width:60px"></label>
      <button id="rating-submit">등록</button>
    </div>
    <div style="margin-top:8px">
      <textarea id="comment-input" rows="2" placeholder="한마디" style="width:90%"></textarea>
      <button id="comment-submit">작성</button>
    </div>
    <div id="recent" style="margin-top:12px; text-align:left; display:inline-block"></div>
  `;

  // 이벤트 바인딩
  (async () => {
    const entityId = await getEntityIdByName('restaurants', picked.name);
    if (!entityId) return;

    // 초기 로드
    loadRecent(entityId, 'recent');

    document.getElementById('rating-submit').onclick = async () => {
      const val = Number(document.getElementById('rating-input').value);
      const ok = await submitRating('restaurants', entityId, val);
      if (ok) {
        alert('평점 등록 완료');
        loadRecent(entityId, 'recent');
      }
    };

    document.getElementById('comment-submit').onclick = async () => {
      const text = document.getElementById('comment-input').value;
      const ok = await submitComment('restaurants', entityId, text);
      if (ok) {
        document.getElementById('comment-input').value = '';
        loadRecent(entityId, 'recent');
      }
    };
  })();

  // 버튼 보이게 하기
const cafeButton = document.getElementById("cafe-button");
if (cafeButton) {
  cafeButton.style.display = "inline-block";
}

}

function goToCafe() {
  window.location.href = "cafe.html";
}
