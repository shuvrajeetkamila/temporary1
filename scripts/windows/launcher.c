#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <stddef.h>
#include <stdint.h>

struct EmbeddedResource {
    const char *path;
    const unsigned char *data;
    size_t size;
    const char *mime;
};
extern const struct EmbeddedResource g_resources[];
extern const size_t g_resource_count;

/* Required by a few Win32 inline helpers when no C runtime startup is linked. */
unsigned long _tls_index = 0;

static SOCKET g_listener = INVALID_SOCKET;
static volatile LONG g_running = 1;
static volatile LONG64 g_last_heartbeat = 0;

/* Tiny CRT-free string/memory helpers keep the launcher genuinely standalone. */
void *memset(void *destination, int value, size_t count) {
    unsigned char *output = (unsigned char *)destination;
    while (count--) *output++ = (unsigned char)value;
    return destination;
}
void *memcpy(void *destination, const void *source, size_t count) {
    unsigned char *output = (unsigned char *)destination;
    const unsigned char *input = (const unsigned char *)source;
    while (count--) *output++ = *input++;
    return destination;
}
static size_t text_length(const char *text) { const char *end = text; while (*end) ++end; return (size_t)(end - text); }
static int text_equal(const char *a, const char *b) { while (*a && *a == *b) { ++a; ++b; } return *a == *b; }
static int text_contains_parent(const char *text) {
    while (text[0] && text[1]) { if (text[0] == '.' && text[1] == '.') return 1; ++text; }
    return 0;
}
static wchar_t *wide_copy(wchar_t *destination, const wchar_t *source) {
    wchar_t *output = destination; while ((*output++ = *source++) != 0) {} return destination;
}
static size_t wide_length(const wchar_t *text) { const wchar_t *end = text; while (*end) ++end; return (size_t)(end - text); }
static void wide_append(wchar_t *destination, const wchar_t *source) {
    destination += wide_length(destination); while ((*destination++ = *source++) != 0) {}
}
static void wide_append_number(wchar_t *destination, unsigned value) {
    wchar_t reversed[16]; int count = 0;
    do { reversed[count++] = (wchar_t)(L'0' + value % 10); value /= 10; } while (value);
    destination += wide_length(destination);
    while (count) *destination++ = reversed[--count];
    *destination = 0;
}
static char *append_text(char *destination, const char *source) { while (*source) *destination++ = *source++; *destination = 0; return destination; }
static char *append_number(char *destination, size_t value) {
    char reversed[32]; int count = 0;
    do { reversed[count++] = (char)('0' + value % 10); value /= 10; } while (value);
    while (count) *destination++ = reversed[--count];
    *destination = 0; return destination;
}

static int send_all(SOCKET socket, const char *data, size_t size) {
    while (size > 0) {
        int chunk = size > 0x7fffffffU ? 0x7fffffff : (int)size;
        int sent = send(socket, data, chunk, 0);
        if (sent <= 0) return 0;
        data += sent; size -= (size_t)sent;
    }
    return 1;
}

static const struct EmbeddedResource *find_resource(const char *path) {
    if (text_equal(path, "/")) path = "/index.html";
    for (size_t i = 0; i < g_resource_count; ++i) if (text_equal(path, g_resources[i].path)) return &g_resources[i];
    return NULL;
}

static void reply_text(SOCKET client, int found, const char *text) {
    char header[512]; char *cursor = header;
    cursor = append_text(cursor, found ? "HTTP/1.1 200 OK\r\n" : "HTTP/1.1 404 Not Found\r\n");
    cursor = append_text(cursor, "Content-Type: text/plain; charset=utf-8\r\nContent-Length: ");
    cursor = append_number(cursor, text_length(text));
    cursor = append_text(cursor, "\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n");
    send_all(client, header, (size_t)(cursor - header));
    send_all(client, text, text_length(text));
}

static void handle_client(SOCKET client) {
    char request[8192];
    int received = recv(client, request, sizeof(request) - 1, 0);
    if (received <= 0) return;
    request[received] = 0;
    if (received < 6 || request[0] != 'G' || request[1] != 'E' || request[2] != 'T' || request[3] != ' ') {
        reply_text(client, 0, "Not found"); return;
    }
    char path[2048]; int index = 0; const char *input = request + 4;
    while (*input && *input != ' ' && *input != '?' && index < 2047) path[index++] = *input++;
    path[index] = 0;
    if (text_contains_parent(path)) { reply_text(client, 0, "Not found"); return; }
    if (text_equal(path, "/__heartbeat")) {
        InterlockedExchange64(&g_last_heartbeat, (LONG64)GetTickCount64());
        reply_text(client, 1, "ok"); return;
    }
    const struct EmbeddedResource *resource = find_resource(path);
    if (!resource) { reply_text(client, 0, "Not found"); return; }
    InterlockedExchange64(&g_last_heartbeat, (LONG64)GetTickCount64());
    char header[768]; char *cursor = header;
    cursor = append_text(cursor, "HTTP/1.1 200 OK\r\nContent-Type: ");
    cursor = append_text(cursor, resource->mime);
    cursor = append_text(cursor, "\r\nContent-Length: ");
    cursor = append_number(cursor, resource->size);
    cursor = append_text(cursor,
        "\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n"
        "Cross-Origin-Opener-Policy: same-origin\r\n\r\n");
    if (send_all(client, header, (size_t)(cursor - header))) send_all(client, (const char *)resource->data, resource->size);
}

static DWORD WINAPI server_main(LPVOID unused) {
    (void)unused;
    while (InterlockedCompareExchange(&g_running, 1, 1) != 0) {
        SOCKET client = accept(g_listener, NULL, NULL);
        if (client == INVALID_SOCKET) break;
        DWORD timeout = 8000;
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, (const char *)&timeout, sizeof(timeout));
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, (const char *)&timeout, sizeof(timeout));
        handle_client(client); shutdown(client, SD_BOTH); closesocket(client);
    }
    return 0;
}

static int file_exists(const wchar_t *path) {
    DWORD attributes = GetFileAttributesW(path);
    return attributes != INVALID_FILE_ATTRIBUTES && !(attributes & FILE_ATTRIBUTE_DIRECTORY);
}

static int find_edge(wchar_t *output, DWORD capacity) {
    const wchar_t *variables[] = { L"ProgramFiles(x86)", L"ProgramFiles", L"LOCALAPPDATA" };
    const wchar_t *suffix = L"\\Microsoft\\Edge\\Application\\msedge.exe";
    for (int i = 0; i < 3; ++i) {
        wchar_t base[MAX_PATH] = {0};
        if (GetEnvironmentVariableW(variables[i], base, MAX_PATH) == 0) continue;
        if (wide_length(base) + wide_length(suffix) + 1 >= capacity) continue;
        wide_copy(output, base); wide_append(output, suffix);
        if (file_exists(output)) return 1;
    }
    return 0;
}

static int launch_edge_app(const wchar_t *url) {
    wchar_t executable[MAX_PATH] = {0};
    wchar_t local_data[MAX_PATH] = {0};
    wchar_t app_directory[MAX_PATH] = {0};
    wchar_t profile[MAX_PATH] = {0};
    GetEnvironmentVariableW(L"LOCALAPPDATA", local_data, MAX_PATH);
    wide_copy(app_directory, local_data); wide_append(app_directory, L"\\NauruCountryside");
    CreateDirectoryW(app_directory, NULL);
    wide_copy(profile, app_directory); wide_append(profile, L"\\EdgeProfile");
    CreateDirectoryW(profile, NULL);

    wchar_t parameters[2048] = {0};
    wide_copy(parameters, L"--app=\""); wide_append(parameters, url);
    wide_append(parameters, L"\" --start-maximized --no-first-run --disable-session-crashed-bubble --user-data-dir=\"");
    wide_append(parameters, profile); wide_append(parameters, L"\"");

    SHELLEXECUTEINFOW info = {0};
    info.cbSize = sizeof(info); info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI;
    info.lpVerb = L"open"; info.lpFile = find_edge(executable, MAX_PATH) ? executable : L"msedge.exe";
    info.lpParameters = parameters; info.nShow = SW_SHOWNORMAL;
    if (!ShellExecuteExW(&info)) return 0;
    if (info.hProcess) CloseHandle(info.hProcess);
    return 1;
}

static int app_main(void) {
    SetProcessDPIAware();
    WSADATA winsock;
    if (WSAStartup(MAKEWORD(2, 2), &winsock) != 0) {
        MessageBoxW(NULL, L"Could not initialize the local game server.", L"NAURU: The Countryside", MB_ICONERROR); return 1;
    }
    int selected_port = 0;
    for (int port = 48631; port <= 48649; ++port) {
        SOCKET candidate = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (candidate == INVALID_SOCKET) continue;
        struct sockaddr_in address = {0};
        address.sin_family = AF_INET; address.sin_addr.s_addr = htonl(INADDR_LOOPBACK); address.sin_port = htons((u_short)port);
        if (bind(candidate, (struct sockaddr *)&address, sizeof(address)) == 0 && listen(candidate, SOMAXCONN) == 0) {
            g_listener = candidate; selected_port = port; break;
        }
        closesocket(candidate);
    }
    if (!selected_port) {
        WSACleanup();
        MessageBoxW(NULL, L"No local port is available. Close another copy of the game and try again.", L"NAURU: The Countryside", MB_ICONERROR); return 2;
    }
    InterlockedExchange64(&g_last_heartbeat, (LONG64)GetTickCount64());
    HANDLE thread = CreateThread(NULL, 0, server_main, NULL, 0, NULL);
    wchar_t url[128] = L"http://127.0.0.1:";
    wide_append_number(url, (unsigned)selected_port); wide_append(url, L"/");
    if (!launch_edge_app(url)) {
        HINSTANCE result = ShellExecuteW(NULL, L"open", url, NULL, NULL, SW_SHOWNORMAL);
        if ((INT_PTR)result <= 32) {
            InterlockedExchange(&g_running, 0); closesocket(g_listener); if (thread) CloseHandle(thread); WSACleanup();
            MessageBoxW(NULL, L"Microsoft Edge or a default browser is required to run the game.", L"NAURU: The Countryside", MB_ICONERROR); return 3;
        }
    }
    for (;;) {
        Sleep(1000);
        ULONGLONG last = (ULONGLONG)InterlockedCompareExchange64(&g_last_heartbeat, 0, 0);
        if (GetTickCount64() - last > 22000) break;
    }
    InterlockedExchange(&g_running, 0); shutdown(g_listener, SD_BOTH); closesocket(g_listener);
    if (thread) { WaitForSingleObject(thread, 3000); CloseHandle(thread); }
    WSACleanup(); return 0;
}

void WINAPI WinMainCRTStartup(void) { ExitProcess((UINT)app_main()); }
