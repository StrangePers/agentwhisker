(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AgentWhiskerLocale = api;
})(globalThis, function () {
  "use strict";

  const languages = Object.freeze({ en: "English", es: "Español", "zh-CN": "简体中文", hi: "हिन्दी" });
  // Each message follows the language order above. Placeholders are shared across translations.
  const messages = {
    openProjectFolder:["Open project folder","Abrir carpeta del proyecto","打开项目文件夹","प्रोजेक्ट फ़ोल्डर खोलें"],
    folderUnavailable:["The task ended or its folder is unavailable.","La tarea terminó o su carpeta no está disponible.","任务已结束或文件夹不可用。","कार्य समाप्त हो गया है या उसका फ़ोल्डर उपलब्ध नहीं है।"],
    chooseFile:["Choose file…","Elegir archivo…","选择文件…","फ़ाइल चुनें…"],
    connectAgent:["Connect your coding agent","Conecta tu agente","连接你的编程智能体","अपना कोडिंग एजेंट जोड़ें"],
    findingAgents:["Looking for local agents…","Buscando agentes locales…","正在查找本地智能体…","स्थानीय एजेंट खोजे जा रहे हैं…"],
    pickAgent:["Choose an agent to follow.","Elige un agente para seguirlo.","选择要关注的智能体。","जिस एजेंट को देखना है उसे चुनें।"],
    noAgent:["No agents found. You can still choose a source manually.","No se encontraron agentes. Puedes elegir una fuente manualmente.","未发现智能体。你仍可手动选择来源。","कोई एजेंट नहीं मिला। आप स्रोत स्वयं चुन सकते हैं।"],
    chooseSource:["Choose another source","Elegir otra fuente","选择其他来源","दूसरा स्रोत चुनें"],
    keepDesktop:["Keep Kitsu on my desktop","Dejar a Kitsu en mi escritorio","仅将 Kitsu 留在桌面","Kitsu को डेस्कटॉप पर रखें"],
    retrySource:["Check again","Volver a comprobar","重新检查","फिर जाँचें"],
    startSession:["Start a session in your agent to see activity here.","Inicia una sesión en tu agente para ver su actividad aquí.","在智能体中启动会话即可查看活动。","गतिविधि देखने के लिए एजेंट में एक सत्र शुरू करें।"],
    unreadableSource:["Could not read this source. Check its location and try again.","No se pudo leer esta fuente. Revisa su ubicación y vuelve a intentarlo.","无法读取此来源。请检查位置并重试。","स्रोत पढ़ा नहीं जा सका। उसका स्थान जाँचें और फिर प्रयास करें।"],
    checkJson:["Check the JSON file path and status data.","Comprueba la ruta y los datos del archivo JSON.","请检查 JSON 文件路径和状态数据。","JSON फ़ाइल का पथ और स्थिति डेटा जाँचें।"],
    connectedIdle:["Connected. No active task.","Conectado. No hay tareas activas.","已连接。没有活动任务。","जुड़ा है। कोई सक्रिय कार्य नहीं है।"],
    system: ["System language","Idioma del sistema","跟随系统","सिस्टम की भाषा"],
    language: ["Language","Idioma","语言","भाषा"],
    selectLanguageError: ["Could not save the language. Try again.","No se pudo guardar el idioma. Inténtalo de nuevo.","无法保存语言设置，请重试。","भाषा सहेजी नहीं जा सकी। फिर कोशिश करें।"],
    petRegion: ["Desktop companion","Compañera de escritorio","桌面伙伴","डेस्कटॉप साथी"],
    petMenuHint: ["{name} · Right-click for menu","{name} · Haz clic derecho para abrir el menú","{name} · 右键打开菜单","{name} · मेनू के लिए दायाँ क्लिक करें"],
    loadingTasks: ["Reading tasks…","Leyendo tareas…","正在读取任务…","कार्य पढ़े जा रहे हैं…"],
    petActions: ["Companion actions","Acciones de la compañera","伙伴操作","साथी के विकल्प"],
    petSettings: ["Companion settings","Ajustes de la compañera","伙伴设置","साथी की सेटिंग"],
    showLimits: ["Show usage limits","Mostrar límites de uso","显示用量限额","उपयोग सीमाएँ दिखाएँ"],
    hideLimits: ["Hide usage limits","Ocultar límites de uso","隐藏用量限额","उपयोग सीमाएँ छिपाएँ"],
    showTasks: ["Show tasks","Mostrar tareas","显示任务","कार्य दिखाएँ"],
    showNumberedTasks: ["Show tasks ({count})","Mostrar tareas ({count})","显示任务（{count}）","कार्य दिखाएँ ({count})"],
    usageLimits: ["Subscription limits","Límites de suscripción","订阅限额","सदस्यता की सीमाएँ"],
    limitsDescription: ["Remaining usage and reset times","Uso disponible y horarios de reinicio","剩余用量和重置时间","शेष उपयोग और रीसेट का समय"],
    refreshLimits: ["Refresh limits","Actualizar límites","刷新限额","सीमाएँ रीफ़्रेश करें"],
    readLimits: ["Reading limits…","Leyendo límites…","正在读取限额…","सीमाएँ पढ़ी जा रही हैं…"],
    tasks: ["Tasks","Tareas","任务","कार्य"],
    collapseTasks: ["Collapse tasks","Contraer tareas","收起任务","कार्य सूची समेटें"],
    activeTasks: ["Active tasks","Tareas activas","进行中的任务","सक्रिय कार्य"],
    pet: ["Companion","Compañera","伙伴","साथी"],
    closeSettings: ["Close settings","Cerrar ajustes","关闭设置","सेटिंग बंद करें"],
    character: ["Character","Personaje","角色","चरित्र"],
    chooseCharacter: ["Choose a character","Elegir personaje","选择角色","चरित्र चुनें"],
    installCharacter: ["Install character","Instalar personaje","安装角色","चरित्र इंस्टॉल करें"],
    installCharacterAction: ["Install character…","Instalar personaje…","安装角色…","चरित्र इंस्टॉल करें…"],
    size: ["Size","Tamaño","大小","आकार"],
    idleAnimation: ["Idle animation","Animación en reposo","空闲动画","निष्क्रिय अवस्था का ऐनिमेशन"],
    continuous: ["Continuous","Continua","持续播放","लगातार"],
    eventsOnly: ["Only on events","Solo con eventos","仅在有事件时","केवल इवेंट होने पर"],
    taskLabel: ["Task label below the companion","Etiqueta de tarea bajo la compañera","在伙伴下方显示任务名称","साथी के नीचे कार्य का नाम"],
    taskBubble: ["Bubble for active tasks","Burbuja de tareas activas","显示活动任务气泡","सक्रिय कार्यों का बुलबुला"],
    launchAtLogin: ["Start when I sign in to Windows","Iniciar al entrar en Windows","登录 Windows 时启动","Windows में साइन इन करते समय शुरू करें"],
    notifyOnAttention: ["Notify when a task needs a reply or fails","Avisar si una tarea necesita respuesta o falla","任务需要回复或失败时通知我","कार्य को जवाब चाहिए या वह विफल हो तो सूचना दें"],
    dailySaveError: ["Couldn’t save this setting.","No se pudo guardar este ajuste.","无法保存此设置。","यह सेटिंग सहेजी नहीं जा सकी।"],
    source: ["Source","Fuente","来源","स्रोत"],
    automatic: ["Automatic","Automático","自动","स्वचालित"],
    statusFile: ["Status file","Archivo de estado","状态文件","स्थिति फ़ाइल"],
    customFile: ["Custom status file","Archivo de estado personalizado","自定义状态文件","कस्टम स्थिति फ़ाइल"],
    desktop: ["Desktop","Escritorio","桌面","डेस्कटॉप"],
    agent: ["Agent","Agente","智能体","एजेंट"],
    openTask: ["Open task","Abrir tarea","打开任务","कार्य खोलें"],
    previewAnimations: ["Preview animations","Ver animaciones","预览动画","ऐनिमेशन का पूर्वावलोकन करें"],
    idle: ["Idle","En reposo","空闲","निष्क्रिय"],
    running: ["Working","En curso","工作中","काम जारी है"],
    waiting: ["Waiting for a decision","Esperando una decisión","等待决定","निर्णय की प्रतीक्षा है"],
    failed: ["Error","Error","出错","त्रुटि"],
    review: ["In review","En revisión","审核中","समीक्षा जारी है"],
    accepted: ["Task accepted","Tarea aceptada","任务已接受","कार्य स्वीकार हुआ"],
    checksRunning: ["Running checks","Ejecutando comprobaciones","正在运行检查","जाँच चल रही हैं"],
    otherTasks: ["Also working on {count}","También hay {count} en curso","另有 {count} 项任务正在进行","{count} और कार्य जारी हैं"],
    taskCountOne: ["{count} task","{count} tarea","{count} 项任务","{count} कार्य"],
    taskCountOther: ["{count} tasks","{count} tareas","{count} 项任务","{count} कार्य"],
    inProgress: ["In progress","En curso","进行中","जारी"],
    noTasks: ["No active tasks","No hay tareas activas","没有活动任务","कोई सक्रिय कार्य नहीं है"],
    sourceDown: ["Source unavailable","Fuente no disponible","来源不可用","स्रोत उपलब्ध नहीं है"],
    consoleDown: ["Agent Console is disconnected","Agent Console está desconectada","已与 Agent Console 断开连接","Agent Console से कनेक्शन नहीं है"],
    openConsoleAgain: ["Open Agent Console from its shortcut and try again.","Abre Agent Console desde su acceso directo y vuelve a intentarlo.","请通过快捷方式打开 Agent Console，然后重试。","Agent Console को उसके शॉर्टकट से खोलें और फिर कोशिश करें।"],
    consoleOpenFailed: ["Could not open Agent Console.","No se pudo abrir Agent Console.","无法打开 Agent Console。","Agent Console नहीं खुल सका।"],
    answerNeeded: ["Your response is needed","Se necesita tu respuesta","需要你的回复","आपका जवाब चाहिए"],
    answerWithDetail: ["Your response is needed · {detail}","Se necesita tu respuesta · {detail}","需要你的回复 · {detail}","आपका जवाब चाहिए · {detail}"],
    checkingContext: ["Checks · {context}","Comprobaciones · {context}","检查 · {context}","जाँच · {context}"],
    threadTitle: ["{source} session","Sesión de {source}","{source} 会话","{source} सत्र"],
    loadPetFailure: ["Could not load the character.","No se pudo cargar el personaje.","无法加载角色。","चरित्र लोड नहीं हो सका।"],
    selectPetFailure: ["Could not switch characters. Try again.","No se pudo cambiar de personaje. Inténtalo de nuevo.","无法切换角色，请重试。","चरित्र बदला नहीं जा सका। फिर कोशिश करें।"],
    kitsuDescription: ["A fox-eared companion with amber eyes and a fluffy tail.","Una compañera de orejas de zorro, ojos ámbar y cola esponjosa.","一位长着狐狸耳朵、琥珀色眼睛和蓬松尾巴的桌面伙伴。","लोमड़ी जैसे कान, सुनहरी आँखें और फूली हुई पूँछ वाली साथी।"],
    timeUnknown: ["Last check time unknown","No se conoce la hora de la última comprobación","上次检查时间未知","पिछली जाँच का समय अज्ञात है"],
    justChecked: ["Checked just now","Comprobado hace un momento","刚刚检查","अभी जाँच हुई"],
    checkedMinutes: ["Checked {count} min ago","Comprobado hace {count} min","{count} 分钟前检查","{count} मिनट पहले जाँच हुई"],
    checkedHours: ["Checked {count} h ago","Comprobado hace {count} h","{count} 小时前检查","{count} घंटे पहले जाँच हुई"],
    refreshingSaved: ["Refreshing… Showing saved data.","Actualizando… Se muestran los datos guardados.","正在刷新，当前显示已保存的数据。","रीफ़्रेश हो रहा है। सहेजा गया डेटा दिख रहा है।"],
    refreshingLimits: ["Refreshing limits…","Actualizando límites…","正在刷新限额…","सीमाएँ रीफ़्रेश हो रही हैं…"],
    refreshOverdue: ["Refresh did not finish. Showing saved data.","La actualización no terminó. Se muestran los datos guardados.","刷新未完成，当前显示已保存的数据。","रीफ़्रेश पूरा नहीं हुआ। सहेजा गया डेटा दिख रहा है।"],
    refreshFailed: ["Could not refresh limits. Showing saved data.","No se pudieron actualizar los límites. Se muestran los datos guardados.","无法刷新限额，当前显示已保存的数据。","सीमाएँ रीफ़्रेश नहीं हो सकीं। सहेजा गया डेटा दिख रहा है।"],
    limitsPending: ["Limits are not available yet.","Los límites aún no están disponibles.","暂无限额数据。","सीमाएँ अभी उपलब्ध नहीं हैं।"],
    limitsLoadFailed: ["Could not load limits. Try refreshing.","No se pudieron cargar los límites. Intenta actualizar.","无法加载限额，请尝试刷新。","सीमाएँ लोड नहीं हुईं। रीफ़्रेश करके देखें।"],
    limitsCodexSignIn: ["Sign in to Codex with ChatGPT to see subscription limits.","Inicia sesión en Codex con ChatGPT para ver los límites de suscripción.","使用 ChatGPT 登录 Codex 后可查看订阅限额。","सदस्यता की सीमाएँ देखने के लिए ChatGPT से Codex में साइन इन करें।"],
    limitsOpenCodeStart: ["Start OpenCode to see Go limits.","Inicia OpenCode para ver los límites de Go.","启动 OpenCode 后可查看 Go 限额。","Go की सीमाएँ देखने के लिए OpenCode शुरू करें।"],
    limitsOpenCodeSignIn: ["Go limits are available after you connect an OpenCode workspace with a Go subscription.","Los límites de Go están disponibles al conectar un espacio de OpenCode con una suscripción Go.","连接订阅了 Go 的 OpenCode 工作区后即可查看限额。","Go की सीमाएँ देखने के लिए Go सदस्यता वाला OpenCode वर्कस्पेस जोड़ें।"],
    limitsOpenCodeVersion: ["This OpenCode service does not expose Go limits.","Este servicio de OpenCode no proporciona los límites de Go.","此 OpenCode 服务未提供 Go 限额。","यह OpenCode सेवा Go की सीमाएँ उपलब्ध नहीं कराती।"],
    showAllLimits: ["Show all limits","Ver todos los límites","显示所有限额","सभी सीमाएँ दिखाएँ"],
    showFewerLimits: ["Show summary","Ver resumen","显示摘要","सारांश दिखाएँ"],
    limitsButtonSetting: ["Limits button","Botón de límites","限额按钮","सीमाओं का बटन"],
    hideLimitsButton: ["Hide","Ocultar","隐藏","छिपाएँ"],
    limitCredits: ["Credits","Créditos","余额","क्रेडिट"],
    limitFiveHours: ["5 hours","5 horas","5 小时","5 घंटे"],
    limitWeek: ["Week","Semana","一周","सप्ताह"],
    limitMonth: ["Month","Mes","一个月","महीना"],
    limitPrimary: ["Primary limit","Límite principal","主要限额","मुख्य सीमा"],
    limitSecondary: ["Secondary limit","Límite secundario","次要限额","दूसरी सीमा"],
    limitIndividual: ["Individual limit","Límite individual","个人限额","व्यक्तिगत सीमा"],
    retryLimit: ["{status} Click to retry.","{status} Haz clic para reintentar.","{status} 点击重试。","{status} फिर कोशिश करने के लिए क्लिक करें।"],
    noData: ["No data","Sin datos","暂无数据","डेटा नहीं है"],
    partialLimits: ["Some limits are unknown","Se desconocen algunos límites","部分限额未知","कुछ सीमाएँ अज्ञात हैं"],
    staleLimits: ["Out of date","Desactualizado","数据已过期","पुराना डेटा"],
    limit: ["Limit","Límite","限额","सीमा"],
    remaining: ["{value} remaining","Queda {value}","剩余 {value}","{value} शेष"],
    previousRemaining: ["Previously {value}","Antes quedaba {value}","之前剩余 {value}","पहले {value} शेष था"],
    remainingLabel: ["Remaining · {label}","Restante · {label}","剩余 · {label}","शेष · {label}"],
    limitWindowEnded: ["Window ended · Waiting for new data","Período terminado · A la espera de datos nuevos","周期已结束，等待新数据","अवधि समाप्त · नए डेटा की प्रतीक्षा है"],
    resetAt: ["Resets {time}","Se reinicia {time}","重置时间：{time}","रीसेट का समय {time}"],
    resetUnknown: ["Reset time unknown","Se desconoce la hora de reinicio","重置时间未知","रीसेट का समय अज्ञात है"],
    subscriptionUnknown: ["Subscription limits are unavailable.","No hay datos de los límites de suscripción.","暂无订阅限额数据。","सदस्यता की सीमाएँ उपलब्ध नहीं हैं।"],
    balanceAvailable: ["{value} available","{value} disponible","可用余额 {value}","{value} उपलब्ध"],
    balancePrevious: ["Previously {value} available","Antes había {value} disponible","之前可用余额 {value}","पहले {value} उपलब्ध था"],
    balanceUnknown: ["Balance unknown","Saldo desconocido","余额未知","बैलेंस अज्ञात है"],
    limitsUnavailable: ["Limits are unavailable. Reopen the panel to retry.","Los límites no están disponibles. Vuelve a abrir el panel para reintentar.","限额不可用，请重新打开面板。","सीमाएँ उपलब्ध नहीं हैं। फिर कोशिश करने के लिए पैनल दोबारा खोलें।"],
    limitsToggleFailed: ["Could not change the limits panel. Try again.","No se pudo cambiar el panel de límites. Inténtalo de nuevo.","无法切换限额面板，请重试。","सीमा पैनल बदला नहीं जा सका। फिर कोशिश करें।"],
    installPackError: ["Could not install the pack. Check the character file.","No se pudo instalar el paquete. Revisa el archivo del personaje.","无法安装角色包，请检查角色文件。","पैक इंस्टॉल नहीं हो सका। चरित्र की फ़ाइल जाँचें।"],
    saveIdleError: ["Could not save the idle animation setting.","No se pudo guardar el ajuste de animación en reposo.","无法保存空闲动画设置。","निष्क्रिय ऐनिमेशन की सेटिंग सहेजी नहीं जा सकी।"],
    saveBubbleError: ["Could not save the task bubble setting.","No se pudo guardar el ajuste de la burbuja de tareas.","无法保存任务气泡设置。","कार्य बुलबुले की सेटिंग सहेजी नहीं जा सकी।"],
    saveTaskLabelError: ["Could not save the task label setting.","No se pudo guardar el ajuste de la etiqueta de tareas.","无法保存任务名称设置。","कार्य के नाम की सेटिंग सहेजी नहीं जा सकी।"],
    showApp: ["Show AgentWhisker","Mostrar AgentWhisker","显示 AgentWhisker","AgentWhisker दिखाएँ"],
    hideApp: ["Hide AgentWhisker","Ocultar AgentWhisker","隐藏 AgentWhisker","AgentWhisker छिपाएँ"],
    quitApp: ["Quit AgentWhisker","Salir de AgentWhisker","退出 AgentWhisker","AgentWhisker बंद करें"],
    showConsole: ["Show Agent Console","Mostrar Agent Console","显示 Agent Console","Agent Console दिखाएँ"],
    taskPanel: ["Task panel","Panel de tareas","任务面板","कार्य पैनल"],
    packFilter: ["AgentWhisker pack","Paquete de AgentWhisker","AgentWhisker 角色包","AgentWhisker पैक"],
  };
  const codes = Object.keys(languages);

  function normalizeLocale(value) {
    if (typeof value !== "string") return "";
    const language = value.trim().toLowerCase().split(/[-_]/)[0];
    if (language === "zh") return "zh-CN";
    return codes.includes(language) ? language : "";
  }

  function chooseLocale(...preferences) {
    return preferences.map(normalizeLocale).find(Boolean) || "en";
  }

  function translator(preference) {
    const locale = chooseLocale(preference);
    const index = codes.indexOf(locale);
    const plural = new Intl.PluralRules(locale);
    const numbers = new Intl.NumberFormat(locale);
    const t = (key, values = {}) => messages[key][index].replace(/\{(\w+)\}/g, (placeholder, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder);
    return {
      locale, t,
      taskCount: count => t(plural.select(count) === "one" ? "taskCountOne" : "taskCountOther", { count: numbers.format(count) }),
    };
  }

  function apply(root, t) {
    for (const element of root.querySelectorAll("[data-t]")) element.textContent = t(element.dataset.t);
    for (const element of root.querySelectorAll("[data-t-title]")) element.title = t(element.dataset.tTitle);
    for (const element of root.querySelectorAll("[data-t-label]")) element.setAttribute("aria-label", t(element.dataset.tLabel));
  }

  return { languages, normalizeLocale, chooseLocale, translator, apply };
});
