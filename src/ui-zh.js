// Chinese UI text, including status messages produced while playing/editing.
const phrases = {
  'Map editor': '地图编辑器', 'Hemu Map Editor': '禾木地图编辑器', 'Koktokay Map Editor': '可可托海地图编辑器',
  'Hemu / 吉克普林': '禾木 / 吉克普林', 'Koktokay / 可可托海': '可可托海',
  'Click a tile, or drag a box.': '单击地块，或拖动框选。',
  'Shift adds to the selection, Alt takes away.': '按住 Shift 添加选择，按住 Alt 取消选择。',
  "Flatten to the selection's average height": '平整到所选地块的平均高度',
  'Take the bumps out': '平滑地形起伏', 'Click a run to edit it.': '单击雪道开始编辑。',
  'Drag a point to move it. Double-click the line to add one, Alt-click a point (or hover it and press Del) to remove it.': '拖动节点调整雪道；双击线路添加节点，按住 Alt 单击节点或按 Del 删除。',
  'Click a tree, or drag a box. Shift adds, Alt takes away. Removed trees show in red; select them to restore.': '单击树木或拖动框选；Shift 添加、Alt 取消。已移除树木以红色显示，可选择后恢复。',
  'Click to plant a tree; drag to plant a row. Planted trees stand even on a run.': '单击种树，拖动成行种植；手动种植也可放在雪道上。',
  'Forest placement is estimated from terrain; OSM has no forest polygons here.': '树林位置根据地形估计，OSM 未提供此处的森林边界。',
  'Drag the estimated ski hall or a lift station to move it. Turn the hall with the round handle. OpenStreetMap station and resort markers are read-only.': '拖动大厅或索道站移动；拖动圆形手柄旋转大厅。OSM 站点和雪场标记仅供查看。',
  'Drag a hall, the hot spring, a vehicle or a lift station to move it; drag the round handle off its corner to turn it (Shift snaps to 15°). Joined stations move together: Alt-drag pulls one away.': '拖动大厅、温泉、车辆或索道站移动。拖动角落的圆形手柄旋转（Shift 按 15° 对齐）。相连站点一起移动，Alt 拖动可分离。',
  'Left-drag pans. In any tool, right-drag orbits, middle-drag (or Space + drag) pans, and the wheel zooms to the cursor.': '左键拖动平移；右键拖动旋转视角，中键或空格加拖动平移，滚轮缩放。',
  'Click something to move it.': '选择物体后拖动移动。', 'Select a lift station.': '选择大厅或索道站。',
  'Click a hall, the hot spring, a vehicle or a lift station.': '选择大厅、温泉、车辆或索道站。',
  'Put it back where the game first had it': '恢复默认位置', 'Throw away saved edits and go back to the baked map': '清除已保存的编辑并恢复原始地图',
  'Show how wide the game makes the runs (L)': '显示雪道宽度（L）',
  'Smooth the ground under the run': '平滑雪道下方地形', 'Level the run side to side': '横向平整雪道',
  'Click the view, then move the mouse to look around you, up, down and all the way round (or drag across the view).': '单击画面后移动鼠标环顾四周，也可拖动视角。',
  'frees the mouse.': '释放鼠标。', 'Nothing to set on a touch screen yet.': '触屏操作无需额外设置。',
  'On foot / Board switches · push the stick up to walk, all the way out to run': '切换步行或滑行；向上推摇杆步行，推到底奔跑。',
  'Outfit & gear': '服装与装备', 'Weather & time': '天气与时间', 'Male rider': '男滑手', 'Female rider': '女滑手', 'Classic rider': '经典滑手',
  'Choose a rider': '选择滑手', 'Loading rider…': '正在加载滑手…', 'Coming soon': '即将推出', 'Let the day go by': '时间自动流逝', 'Aurora by night': '夜间极光',
  'See it on the diorama ▸': '查看沙盘 ▸', 'Back to riding': '返回滑行', 'Clear route': '清除路线',
  'Back to the start': '回到出发点', 'Open the map': '打开地图', 'Close the map': '关闭地图', 'Centre on you': '定位当前位置',
  'Snow mountain backdrop': '雪山背景', 'snow mountain backdrop': '雪山背景', 'km editable': '公里可编辑区域',
  'Loading the map': '正在加载地图', 'Trees can\'t go there': '此处无法种树', 'A run needs at least two points': '雪道至少需要两个节点',
  'Nothing to undo': '没有可撤销的操作', 'Nothing to redo': '没有可重做的操作',
  'Save and ride it': '保存并进入游戏', 'Forest density': '树林密度', 'Run width': '雪道宽度', 'Turn left': '向左旋转', 'Turn right': '向右旋转', 'Put back': '恢复位置',
  'Magic carpet': '魔毯', 'Hot spring': '温泉', 'East Service Centre': '东区服务大厅', 'West Service Centre': '西区服务大厅', 'Ski Hall': '滑雪大厅',
  'Chair lift': '吊椅索道', 'chair lift': '吊椅索道', 'magic carpet': '魔毯', 'Snowboard': '单板', 'Skis': '双板',
  'On foot': '步行', 'On board': '滑行', 'Drop in!': '开始滑行！', 'Drop in ▸': '开始滑行 ▸',
  'Sound effects': '音效', 'Mouse look': '鼠标视角', 'Time of day': '时刻', 'Whole map': '全图', 'Zoom in': '放大', 'Zoom out': '缩小',
  'frame the selection': '聚焦所选内容', 'raise / lower by the step': '按步长升高或降低', 'delete tiles / run point / trees': '删除地块、雪道节点或树木',
  'trees: select ↔ plant': '树木：选择 / 种植', 'objects: turn left / right': '物体：向左 / 向右旋转', 'run widths layer': '雪道宽度图层',
  'clear the selection': '清除选择', 'undo · save': '撤销 · 保存', 'pan (Shift: faster)': '平移（Shift 加速）', 'zoom to cursor': '以光标为中心缩放',
  'groomed run,': '压雪雪道，', 'm each side of its line': '米 / 侧', 'where the board stops riding it as piste': '雪道边界', "the forest's margin: trees from here": '树林分布边界',
  'switch board / on foot': '切换滑行 / 步行', 'Steering: touch and drag': '触摸拖动控制方向',
};
const words = {
  'Map':'地图', 'Tiles':'地块', 'Runs':'雪道', 'Trees':'树木', 'Objects':'物体', 'Hand':'平移', 'Tools':'工具',
  'Raise':'升高', 'Lower':'降低', 'Level':'平整', 'Smooth':'平滑', 'Delete':'删除', 'Restore':'恢复', 'Bench':'横向平整',
  'Step':'步长', 'Blend':'过渡范围', 'Select':'选择', 'Plant':'种植', 'Remove':'移除', 'Facing':'朝向', 'faces':'朝向', 'moved':'已移动',
  'Undo':'撤销', 'Redo':'重做', 'Save':'保存', 'Saved':'已保存', 'Saving':'正在保存', 'Reset':'重置', 'Ride':'滑行', 'Widths':'宽度', 'Keys':'快捷键',
  'top':'山顶', 'bottom':'山脚', 'station':'站', 'end':'端点', 'stations':'站点', 'attraction':'景点', 'gondola':'缆车', 'Gondola':'缆车',
  'Loading':'正在加载', 'Begin':'开始', 'Speed':'速度', 'Time':'时间', 'Alt':'海拔', 'Rider':'滑手', 'Settings':'设置', 'Music':'音乐', 'Menu':'菜单',
  'Diorama':'沙盘', 'Helmet':'头盔', 'Goggles':'雪镜', 'Jacket':'雪服', 'Gloves':'手套', 'Pants':'雪裤', 'Board':'雪板',
  'Sunrise':'日出', 'Noon':'正午', 'Sunset':'日落', 'Night':'夜晚', 'Morning':'上午', 'Afternoon':'下午', 'Evening':'傍晚', 'Dawn':'黎明', 'Dusk':'黄昏',
  'Clear':'晴天', 'Cloudy':'多云', 'Snowing':'降雪', 'Blizzard':'暴风雪', 'Changeable':'天气变化', 'Weather':'天气', 'Continue':'继续',
  'You':'你的位置', 'pan':'平移', 'orbit':'旋转', 'right-drag':'右键拖动', 'middle':'中键', 'wheel':'滚轮',
  'novice':'入门', 'easy':'初级', 'intermediate':'中级', 'advanced':'高级', 'expert':'专家', 'freeride':'野雪',
  'points':'节点', 'tiles':'地块', 'deleted':'已删除', 'removed':'已移除', 'planted':'已种植', 'trees':'棵树', 'runs':'条雪道', 'places':'处物体',
  'Tree':'树木', 'tree':'树木', 'long':'长', 'climbs':'爬升', 'tall':'高', 'drop':'落差', 'seats':'座',
  'walk':'步行', 'run':'奔跑', 'turn':'转向', 'stop':'停止', 'carve':'转弯', 'tuck':'压低重心', 'push':'蹬行', 'skid':'侧滑刹车',
  'Wipeout':'摔倒', 'Landed':'已落地', 'Arrived':'已到达', 'Pickup':'皮卡', 'Snowmobile':'雪地摩托', 'Unnamed':'未命名', 'unnamed':'未命名',
};
const entries = Object.entries(phrases).sort((a,b) => b[0].length-a[0].length);
const tokens = new RegExp('\\b(' + Object.keys(words).sort((a,b)=>b.length-a.length).join('|') + ')\\b', 'g');
export function chinese(value) {
  if (!/[a-zA-Z]/.test(value)) return value;
  for (const [en, zh] of entries) value = value.split(en).join(zh);
  return value.replace(tokens, (word) => words[word]);
}
function translate(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.parentElement?.closest('script, style, kbd, svg')) return;
    const text = chinese(root.data); if (text !== root.data) root.data = text;
  } else if (root.nodeType === Node.ELEMENT_NODE) {
    if (root.matches('script, style, svg')) return;
    for (const attr of ['title', 'aria-label', 'data-tip']) {
      if (root.hasAttribute(attr)) { const before=root.getAttribute(attr), after=chinese(before); if(before!==after) root.setAttribute(attr,after); }
    }
    for (const child of root.childNodes) translate(child);
  }
}
translate(document.body);
new MutationObserver((changes) => {
  for (const change of changes) {
    if (change.type === 'characterData') translate(change.target);
    else if (change.type === 'attributes') translate(change.target);
    else for (const child of change.addedNodes) translate(child);
  }
}).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title','aria-label','data-tip'] });
document.documentElement.lang = 'zh-CN';
