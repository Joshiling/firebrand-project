var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpClient("CompaniesHouse", client =>
{
    client.BaseAddress = new Uri("https://api.company-information.service.gov.uk/");
});
builder.Services.AddSingleton<ICompanySearchService, CompaniesHouseSearchService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapCompanyEndpoints();

app.Run();
